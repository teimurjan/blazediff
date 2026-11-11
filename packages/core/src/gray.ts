/**
 * The gray background of the diff image, for little-endian platforms.
 *
 * The shifts and integer weights in the fill loop are literals on purpose.
 * Bundlers emit module-level constants as `var`, which V8 cannot fold, and
 * that costs the loop about a third of its speed.
 */
import { YIQ_Y_B, YIQ_Y_G, YIQ_Y_R } from "./pixel";

/** The fill loop sorts opaque pixels into this many luma buckets per luma unit. */
const BUCKETS_PER_UNIT = 16;
const WHITE_BUCKET = 255 * BUCKETS_PER_UNIT;
const BUCKET_COUNT = WHITE_BUCKET + 2;

/** Shortest run of one color that is cheaper to hand to the native `fill`. */
const MIN_NATIVE_FILL = 32;

/** Above the worst error of the integer luma against the float luma (under 1e-4). */
const LUMA_MARGIN = 1e-3;

/** Opaque gray words by luma bucket; 0 marks a bucket that needs the float formula. */
export type GrayTable = Int32Array;

let cachedAlpha = Number.NaN;
let cachedTable: GrayTable = new Int32Array(BUCKET_COUNT);

function packGray(value: number): number {
	return value | (value << 8) | (value << 16) | 0xff000000;
}

/**
 * Gray words of opaque pixels by luma bucket.
 *
 * With `alpha` in [0, 1] the gray value is a non-decreasing step function of
 * the float luma. A bucket gets a value only when that function is constant
 * over the bucket plus the integer luma's error, so a lookup can never differ
 * from the float formula. Other buckets, and any other `alpha`, stay 0.
 */
export function grayTable(alpha: number): GrayTable {
	if (alpha === cachedAlpha) return cachedTable;
	const table = new Int32Array(BUCKET_COUNT);
	if (alpha >= 0 && alpha <= 1) {
		const valueAt = (luma: number) =>
			(255 + ((luma - 255) * alpha * 255) / 255) | 0;
		for (let bucket = 0; bucket < BUCKET_COUNT; bucket++) {
			const low = valueAt(bucket / BUCKETS_PER_UNIT - LUMA_MARGIN);
			const high = valueAt((bucket + 1) / BUCKETS_PER_UNIT + LUMA_MARGIN);
			if (low === high) table[bucket] = packGray(low);
		}
		// White sits on the last step of the ramp, but it is alone in its bucket.
		table[WHITE_BUCKET] = packGray(
			valueAt(255 * YIQ_Y_R + 255 * YIQ_Y_G + 255 * YIQ_Y_B),
		);
	}
	cachedAlpha = alpha;
	cachedTable = table;
	return table;
}

/** Groups of 4 pixels that {@link isMostlyFlat} probes per range. */
const FLAT_PROBES = 16;
const MIN_FLAT_PROBES = 12;

/**
 * True when enough probed groups of 4 pixels hold one color. Reusing the gray
 * of such groups pays off in screenshots and costs speed in photos.
 */
function isMostlyFlat(image: Int32Array, from: number, to: number): boolean {
	const step = ((to - from) / FLAT_PROBES) & ~3;
	if (step === 0) return false;
	let flat = 0;
	for (let i = from; i + 3 < to; i += step) {
		const word = image[i];
		if (
			((word ^ image[i + 1]) |
				(word ^ image[i + 2]) |
				(word ^ image[i + 3])) ===
			0
		)
			flat++;
	}
	return flat >= MIN_FLAT_PROBES;
}

/**
 * Writes the gray copy of `image[from, to)` to `out`.
 *
 * The bucket of a pixel is its integer luma: the YIQ luma weights times 2^22
 * (1253658, 2460473, 480173), shifted down by 18 for 16 buckets per unit.
 *
 * The function is built inside another one so that the float luma weights are
 * closure constants, which V8 folds into the loop.
 */
export const fillGrayRange = (() => {
	const lumaR = YIQ_Y_R;
	const lumaG = YIQ_Y_G;
	const lumaB = YIQ_Y_B;

	/** The gray output word of one pixel word, as `drawGrayPixel` computes it. */
	function grayWord(word: number, alpha: number): number {
		const luma =
			(word & 0xff) * lumaR +
			((word >>> 8) & 0xff) * lumaG +
			((word >>> 16) & 0xff) * lumaB;
		return packGray((255 + ((luma - 255) * alpha * (word >>> 24)) / 255) | 0);
	}

	return (
		image: Int32Array,
		out: Int32Array,
		from: number,
		to: number,
		table: GrayTable,
		alpha: number,
	): void => {
		if (!isMostlyFlat(image, from, to)) {
			// Photo-like content: one plain lookup per pixel is the fastest loop.
			for (let i = from; i < to; i++) {
				const word = image[i];
				const gray =
					table[
						((word & 0xff) * 1253658 +
							((word >>> 8) & 0xff) * 2460473 +
							((word >>> 16) & 0xff) * 480173) >>>
							18
					];
				out[i] =
					gray !== 0 && word >>> 24 === 0xff ? gray : grayWord(word, alpha);
			}
			return;
		}
		// Gray of the last group of one color, reused while the color repeats.
		let flatWord = image[from];
		let flatGray = grayWord(flatWord, alpha);
		let i = from;
		for (const wideEnd = to - 3; i < wideEnd; i += 4) {
			const w0 = image[i];
			const w1 = image[i + 1];
			const w2 = image[i + 2];
			const w3 = image[i + 3];
			if (((w0 ^ w1) | (w0 ^ w2) | (w0 ^ w3)) === 0) {
				if (w0 !== flatWord) {
					flatWord = w0;
					flatGray = grayWord(w0, alpha);
				}
				let runEnd = i + 4;
				while (
					runEnd < wideEnd &&
					((w0 ^ image[runEnd]) |
						(w0 ^ image[runEnd + 1]) |
						(w0 ^ image[runEnd + 2]) |
						(w0 ^ image[runEnd + 3])) ===
						0
				)
					runEnd += 4;
				if (runEnd - i >= MIN_NATIVE_FILL) out.fill(flatGray, i, runEnd);
				else for (let k = i; k < runEnd; k++) out[k] = flatGray;
				i = runEnd - 4;
				continue;
			}
			// -1 when all four pixels are opaque, else 0: that clears the lookups, so the float formula runs.
			const opaque = -((((w0 & w1 & w2 & w3) >>> 24) + 1) >> 8);
			let gray =
				table[
					((w0 & 0xff) * 1253658 +
						((w0 >>> 8) & 0xff) * 2460473 +
						((w0 >>> 16) & 0xff) * 480173) >>>
						18
				] & opaque;
			out[i] = gray !== 0 ? gray : grayWord(w0, alpha);
			gray =
				table[
					((w1 & 0xff) * 1253658 +
						((w1 >>> 8) & 0xff) * 2460473 +
						((w1 >>> 16) & 0xff) * 480173) >>>
						18
				] & opaque;
			out[i + 1] = gray !== 0 ? gray : grayWord(w1, alpha);
			gray =
				table[
					((w2 & 0xff) * 1253658 +
						((w2 >>> 8) & 0xff) * 2460473 +
						((w2 >>> 16) & 0xff) * 480173) >>>
						18
				] & opaque;
			out[i + 2] = gray !== 0 ? gray : grayWord(w2, alpha);
			gray =
				table[
					((w3 & 0xff) * 1253658 +
						((w3 >>> 8) & 0xff) * 2460473 +
						((w3 >>> 16) & 0xff) * 480173) >>>
						18
				] & opaque;
			out[i + 3] = gray !== 0 ? gray : grayWord(w3, alpha);
		}
		for (; i < to; i++) out[i] = grayWord(image[i], alpha);
	};
})();
