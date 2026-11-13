/**
 * The default YIQ diff, for little-endian platforms. The image is walked in
 * chunks, and each chunk narrows the work in three steps:
 *
 * 1. {@link findDirtyGroups} lists the groups of 4 pixels that may hold a diff.
 * 2. {@link findCandidates} runs the YIQ metric on those groups only.
 * 3. The pixels over the threshold take the anti-aliasing check.
 *
 * Steps 1 and 2 have no data-dependent branch: most differing pixels
 * are noise, and noise defeats branch prediction. They also use literal shifts
 * and spell the channel math out, because V8 compiles the loops about twice as
 * fast without helper calls.
 */
import { antialiased, brightnessDelta } from "./antialiasing";
import { fillGrayRange, grayTable } from "./gray";
import {
	type PixelData,
	YIQ_COEFF_I,
	YIQ_COEFF_Q,
	YIQ_COEFF_Y,
	YIQ_I_B,
	YIQ_I_G,
	YIQ_I_R,
	YIQ_LAMBDA_MAX,
	YIQ_Q_B,
	YIQ_Q_G,
	YIQ_Q_R,
	YIQ_Y_B,
	YIQ_Y_G,
	YIQ_Y_R,
} from "./pixel";
import type { Rgb } from "./types";

/** Pixels per chunk: both inputs of a chunk fit the L1 cache, and V8 optimizes short calls without on-stack replacement. */
const CHUNK = 1 << 12;
const GROUP = 4;

/** The largest squared RGB distance of two pixels. */
const MAX_DISTANCE_SQ = 3 * 255 * 255;

/**
 * Bits that two pixel words must share to be provably within threshold.
 *
 * Words that agree on the top bits of each color channel differ by at most
 * `2^k - 1` per channel. With `3 * (2^k - 1)^2 <= reject`, that is inside the
 * {@link YIQ_LAMBDA_MAX} bound. Alpha must match in full: blending two pixels
 * of equal alpha only shrinks their color deltas.
 */
export function nearMask(reject: number): number {
	let bits = 0;
	while (bits < 7 && 3 * ((2 << bits) - 1) ** 2 <= reject) bits++;
	const channel = 0xff & ~((1 << bits) - 1);
	return channel | (channel << 8) | (channel << 16) | 0xff000000;
}

/** True when the bytes of pixels [from, to) are equal in both images. Null where no native compare exists. */
export type SameRange = ((from: number, to: number) => boolean) | null;

/** What the anti-aliasing check needs; built once per diff. */
interface Scan {
	image1: PixelData;
	image2: PixelData;
	/** Unsigned views, the type `antialiased` takes. */
	a32: Uint32Array;
	b32: Uint32Array;
	width: number;
	height: number;
	excludeAA: boolean;
}

/** Signed view of the same words. V8 keeps signed 32-bit values unboxed; opaque pixels overflow that as unsigned. */
function signedView(words: Uint32Array): Int32Array {
	return new Int32Array(words.buffer, words.byteOffset, words.length);
}

function isAntialiased(scan: Scan, index: number): boolean {
	const { image1, image2, a32, b32, width, height } = scan;
	const y = (index / width) | 0;
	const x = index - y * width;
	return (
		antialiased(image1, x, y, width, height, a32, b32) ||
		antialiased(image2, x, y, width, height, b32, a32)
	);
}

/**
 * Lists the groups of {@link GROUP} pixels in [start, end) that may hold a
 * diff and returns how many. The first pass lists the groups whose words are
 * not all near-equal. The second pass keeps those with a pixel that is outside
 * the reject bound or not opaque.
 */
function findDirtyGroups(
	a: Int32Array,
	b: Int32Array,
	start: number,
	end: number,
	near: number,
	rejectFloor: number,
	dirty: Int32Array,
): number {
	let far = 0;
	let i = start;
	for (const wideEnd = end - 3; i < wideEnd; i += 4) {
		const differing =
			((a[i] ^ b[i]) |
				(a[i + 1] ^ b[i + 1]) |
				(a[i + 2] ^ b[i + 2]) |
				(a[i + 3] ^ b[i + 3])) &
			near;
		dirty[far] = i;
		// The sign bit of `x | -x` is set for every x but 0.
		far += (differing | -differing) >>> 31;
	}

	let count = 0;
	for (let k = 0; k < far; k++) {
		const group = dirty[k];
		const a0 = a[group];
		const b0 = b[group];
		const a1 = a[group + 1];
		const b1 = b[group + 1];
		const a2 = a[group + 2];
		const b2 = b[group + 2];
		const a3 = a[group + 3];
		const b3 = b[group + 3];
		// A negative term sets the sign bit: a distance over the bound, or an alpha under 255.
		let dr = (a0 & 0xff) - (b0 & 0xff);
		let dg = ((a0 >>> 8) & 0xff) - ((b0 >>> 8) & 0xff);
		let db = ((a0 >>> 16) & 0xff) - ((b0 >>> 16) & 0xff);
		let clean = rejectFloor - (dr * dr + dg * dg + db * db);
		dr = (a1 & 0xff) - (b1 & 0xff);
		dg = ((a1 >>> 8) & 0xff) - ((b1 >>> 8) & 0xff);
		db = ((a1 >>> 16) & 0xff) - ((b1 >>> 16) & 0xff);
		clean |= rejectFloor - (dr * dr + dg * dg + db * db);
		dr = (a2 & 0xff) - (b2 & 0xff);
		dg = ((a2 >>> 8) & 0xff) - ((b2 >>> 8) & 0xff);
		db = ((a2 >>> 16) & 0xff) - ((b2 >>> 16) & 0xff);
		clean |= rejectFloor - (dr * dr + dg * dg + db * db);
		dr = (a3 & 0xff) - (b3 & 0xff);
		dg = ((a3 >>> 8) & 0xff) - ((b3 >>> 8) & 0xff);
		db = ((a3 >>> 16) & 0xff) - ((b3 >>> 16) & 0xff);
		clean |= rejectFloor - (dr * dr + dg * dg + db * db);
		clean |= ((a0 & a1 & a2 & a3 & b0 & b1 & b2 & b3) >>> 24) - 0xff;
		dirty[count] = group;
		count += clean >>> 31;
	}
	// The last 1 to 3 pixels of the image go to the per-pixel step as they are.
	if (i < end) dirty[count++] = i;
	return count;
}

/**
 * Lists the pixels of the dirty groups that differ beyond `maxDelta` and
 * returns how many.
 *
 * The function is built inside another one so that the YIQ weights are closure
 * constants, which V8 folds into the loop. Bundlers turn module-level `const`
 * into `var`, and V8 reloads a `var` on each use: 25 to 40% slower here.
 */
const findCandidates = (() => {
	const yR = YIQ_Y_R;
	const yG = YIQ_Y_G;
	const yB = YIQ_Y_B;
	const iR = YIQ_I_R;
	const iG = YIQ_I_G;
	const iB = YIQ_I_B;
	const qR = YIQ_Q_R;
	const qG = YIQ_Q_G;
	const qB = YIQ_Q_B;
	const coeffY = YIQ_COEFF_Y;
	const coeffI = YIQ_COEFF_I;
	const coeffQ = YIQ_COEFF_Q;

	/** YIQ distance of two pixels that are not both opaque, blended over the checkerboard. */
	function blendedDistance(av: number, bv: number, index: number): number {
		const pos = index * 4;
		const a1 = av >>> 24;
		const a2 = bv >>> 24;
		const da = a1 - a2;
		// pos is a multiple of 4, so the red background is always 48.
		const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
		const dr = ((av & 0xff) * a1 - (bv & 0xff) * a2 - 48 * da) / 255;
		const dg =
			(((av >>> 8) & 0xff) * a1 - ((bv >>> 8) & 0xff) * a2 - gb * da) / 255;
		const db =
			(((av >>> 16) & 0xff) * a1 - ((bv >>> 16) & 0xff) * a2 - bb * da) / 255;
		const yc = dr * yR + dg * yG + db * yB;
		const ic = dr * iR + dg * iG + db * iB;
		const qc = dr * qR + dg * qG + db * qB;
		return coeffY * yc * yc + coeffI * ic * ic + coeffQ * qc * qc;
	}

	return (
		a: Int32Array,
		b: Int32Array,
		dirty: Int32Array,
		groups: number,
		end: number,
		maxDelta: number,
		candidates: Int32Array,
	): number => {
		let found = 0;
		for (let group = 0; group < groups; group++) {
			const from = dirty[group];
			const to = from + GROUP < end ? from + GROUP : end;
			for (let i = from; i < to; i++) {
				const av = a[i];
				const bv = b[i];
				let dist: number;
				if ((av & bv) >>> 24 === 0xff) {
					const dr = (av & 0xff) - (bv & 0xff);
					const dg = ((av >>> 8) & 0xff) - ((bv >>> 8) & 0xff);
					const db = ((av >>> 16) & 0xff) - ((bv >>> 16) & 0xff);
					const yc = dr * yR + dg * yG + db * yB;
					const ic = dr * iR + dg * iG + db * iB;
					const qc = dr * qR + dg * qG + db * qB;
					dist = coeffY * yc * yc + coeffI * ic * ic + coeffQ * qc * qc;
				} else {
					dist = blendedDistance(av, bv, i);
				}
				candidates[found] = i;
				found += +(dist > maxDelta);
			}
		}
		return found;
	};
})();

/**
 * Scratch lists for one chunk. They are shared by all calls: a diff runs to
 * completion, and a fresh pair per call keeps the garbage collector busy.
 */
const DIRTY = new Int32Array(CHUNK / GROUP + 1);
const CANDIDATES = new Int32Array(CHUNK + 1);

/** Counts the pixels that differ beyond `maxDelta`. */
export function countDiff(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	height: number,
	maxDelta: number,
	excludeAA: boolean,
	sameRange: SameRange,
): number {
	const len = width * height;
	const reject = maxDelta / YIQ_LAMBDA_MAX;
	const near = nearMask(reject);
	const rejectFloor = Math.min(Math.floor(reject), MAX_DISTANCE_SQ) | 0;
	const scan: Scan = { image1, image2, a32, b32, width, height, excludeAA };
	const a = signedView(a32);
	const b = signedView(b32);
	let diff = 0;
	for (let start = 0; start < len; start += CHUNK) {
		const end = start + CHUNK < len ? start + CHUNK : len;
		if (sameRange?.(start, end)) continue;
		const groups = findDirtyGroups(a, b, start, end, near, rejectFloor, DIRTY);
		if (groups === 0) continue;
		const found = findCandidates(
			a,
			b,
			DIRTY,
			groups,
			end,
			maxDelta,
			CANDIDATES,
		);
		if (!excludeAA) {
			diff += found;
			continue;
		}
		for (let k = 0; k < found; k++)
			if (!isAntialiased(scan, CANDIDATES[k])) diff++;
	}
	return diff;
}

function packRgb([r, g, b]: Rgb): number {
	return r | (g << 8) | (b << 16) | 0xff000000;
}

/** Counts the differing pixels and draws the diff into `out32`. */
export function drawDiff(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	out32: Uint32Array,
	width: number,
	height: number,
	maxDelta: number,
	alpha: number,
	aaColor: Rgb,
	diffColor: Rgb,
	diffColorAlt: Rgb,
	excludeAA: boolean,
	diffMask: boolean,
	sameRange: SameRange,
): number {
	const len = width * height;
	const reject = maxDelta / YIQ_LAMBDA_MAX;
	const near = nearMask(reject);
	const rejectFloor = Math.min(Math.floor(reject), MAX_DISTANCE_SQ) | 0;
	const scan: Scan = { image1, image2, a32, b32, width, height, excludeAA };
	const aaWord = packRgb(aaColor);
	const diffWord = packRgb(diffColor);
	const altWord = packRgb(diffColorAlt);
	const gray = grayTable(alpha);
	const a = signedView(a32);
	const b = signedView(b32);
	const out = signedView(out32);
	let diff = 0;
	for (let start = 0; start < len; start += CHUNK) {
		const end = start + CHUNK < len ? start + CHUNK : len;
		// The gray goes down first; the few diff pixels are drawn over it.
		if (!diffMask) fillGrayRange(a, out, start, end, gray, alpha);
		if (sameRange?.(start, end)) continue;
		const groups = findDirtyGroups(a, b, start, end, near, rejectFloor, DIRTY);
		if (groups === 0) continue;
		const found = findCandidates(
			a,
			b,
			DIRTY,
			groups,
			end,
			maxDelta,
			CANDIDATES,
		);
		for (let k = 0; k < found; k++) {
			const i = CANDIDATES[k];
			if (excludeAA && isAntialiased(scan, i)) {
				if (!diffMask) out[i] = aaWord;
				continue;
			}
			// A positive luma delta means image 2 is darker.
			const darker = brightnessDelta(image1, image2, i * 4, i * 4) > 0;
			out[i] = darker ? altWord : diffWord;
			diff++;
		}
	}
	return diff;
}

/** Writes the gray copy of a whole image, the output of two identical images. */
export function drawGray(
	a32: Uint32Array,
	out32: Uint32Array,
	alpha: number,
): void {
	const len = a32.length;
	const gray = grayTable(alpha);
	const image = signedView(a32);
	const out = signedView(out32);
	for (let start = 0; start < len; start += CHUNK) {
		const end = start + CHUNK < len ? start + CHUNK : len;
		fillGrayRange(image, out, start, end, gray, alpha);
	}
}
