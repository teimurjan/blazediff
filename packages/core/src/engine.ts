import { antialiased } from "./antialiasing";
import { diffExtendedCountOnly, diffExtendedWithOutput } from "./extended";
import {
	type PixelData,
	SHIFT_A,
	SHIFT_B,
	SHIFT_G,
	SHIFT_R,
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
import type { Rgb, WindowHit } from "./types";

/** Resolved options for {@link diffPixels}; every entry point validates first. */
export interface EngineOptions {
	threshold: number;
	alpha: number;
	aaColor: Rgb;
	diffColor: Rgb;
	diffColorAlt: Rgb;
	excludeAA: boolean;
	diffMask: boolean;
	oklab: boolean;
	/** Blend semi-transparent OKLab pixels over pixelmatch 8's checkerboard, or white when false. */
	checkerboard: boolean;
	mask: PixelData | undefined;
	/** Window side from {@link windowSide}, 0 when off. */
	window: number;
}

/**
 * Counts the differing pixels of two equally sized RGBA buffers and, with
 * `output`, draws the diff. With a window, `hit` receives the busiest one.
 * Inputs are trusted: `diff` and the pixelmatch adapter validate them.
 */
export function diffPixels(
	image1: PixelData,
	image2: PixelData,
	output: PixelData | undefined,
	width: number,
	height: number,
	options: EngineOptions,
	hit: WindowHit | null,
): number {
	const {
		threshold,
		alpha,
		aaColor,
		diffColor,
		diffColorAlt,
		excludeAA,
		diffMask,
		oklab,
		checkerboard,
		mask,
		window,
	} = options;
	const len = width * height;

	if (
		typeof Buffer !== "undefined" &&
		Buffer.compare &&
		image1 instanceof Uint8Array &&
		image2 instanceof Uint8Array &&
		Buffer.compare(image1, image2) === 0
	) {
		if (output && !diffMask) fillGray(image1, output, len, alpha);
		return 0;
	}

	const a32 = new Uint32Array(image1.buffer, image1.byteOffset, len);
	const b32 = new Uint32Array(image2.buffer, image2.byteOffset, len);

	// Maximum acceptable square distance between two colors;
	// 35215 is the maximum possible value for the YIQ difference metric
	const maxDelta = 35215 * threshold * threshold;

	// OKLab, a mask or a window take the extended loops, which leave the
	// default YIQ loops below untouched.
	if (oklab || mask || window > 0) {
		const metricDelta = oklab ? threshold : maxDelta;
		const scan = window > 0 ? hit : null;
		if (output == null) {
			return diffExtendedCountOnly(
				image1,
				image2,
				a32,
				b32,
				width,
				height,
				oklab,
				checkerboard,
				metricDelta,
				excludeAA,
				mask,
				window,
				scan,
			);
		}
		return diffExtendedWithOutput(
			image1,
			image2,
			a32,
			b32,
			output,
			width,
			height,
			oklab,
			checkerboard,
			metricDelta,
			calculateOptimalBlockSize(width, height),
			alpha,
			aaColor,
			diffColor,
			diffColorAlt,
			excludeAA,
			diffMask,
			mask,
			window,
			scan,
		);
	}

	// No-output fast paths. Single-pass wins on dense-diff mid-size images
	// (4k photo pairs) because it avoids the redundant equality scan that
	// block-scan does in Pass 1 + Pass 2. Block-scan still wins on both
	// very small images (where the tighter inner loop is easier to JIT) and
	// very large sparse-diff images (where Pass 1's early per-block exit
	// avoids ~all of Pass 2). Both variants use the same inlined-colorDelta
	// / unsigned-distance hot loop.
	if (output == null) {
		if (len < 8_000_000 || len >= 30_000_000) {
			return diffCountOnlyBlocked(
				image1,
				image2,
				a32,
				b32,
				width,
				height,
				maxDelta,
				excludeAA,
			);
		}
		return diffCountOnly(
			image1,
			image2,
			a32,
			b32,
			width,
			height,
			maxDelta,
			excludeAA,
		);
	}

	return diffWithOutput(
		image1,
		image2,
		a32,
		b32,
		output,
		width,
		height,
		maxDelta,
		alpha,
		aaColor,
		diffColor,
		diffColorAlt,
		excludeAA,
		diffMask,
	);
}

/**
 * Fill `output` with grayscale pixels derived from `image`. Uses a Uint32Array
 * view to coalesce four byte stores into a single 32-bit write when the
 * output buffer is 4-byte aligned (universal for `new Uint8Array(W*H*4)` and
 * Node `Buffer.alloc` for non-pool-sized allocs). Falls back to per-byte
 * writes for misaligned views.
 */
function fillGray(
	image: PixelData,
	output: PixelData,
	len: number,
	alpha: number,
): void {
	if ((output.byteOffset & 3) === 0) {
		const out32 = new Uint32Array(output.buffer, output.byteOffset, len);
		for (let i = 0; i < len; i++) {
			const pos = i * 4;
			const luma =
				image[pos] * YIQ_Y_R +
				image[pos + 1] * YIQ_Y_G +
				image[pos + 2] * YIQ_Y_B;
			const value = (255 + ((luma - 255) * alpha * image[pos + 3]) / 255) | 0;
			out32[i] = (value | (value << 8) | (value << 16) | 0xff000000) >>> 0;
		}
		return;
	}
	for (let i = 0; i < len; i++) {
		drawGrayPixel(image, i * 4, alpha, output);
	}
}

/**
 * Optimized output-buffer path. Differences from the naive implementation:
 *  - Uint32Array view of the output coalesces 4 byte stores into 1 store
 *    per pixel (gray, AA, and diff colors all become single 32-bit writes).
 *  - colorDelta is inlined; the redundant sign round-trip through Math.abs
 *    is replaced by a direct unsigned-distance comparison plus a y-sign
 *    test for the diffColorAlt branch (delta < 0 ⟺ y > 0).
 *  - Pre-packed color words (aa/diff/alt) are computed once outside the
 *    hot loops.
 *  - drawGrayPixel is inlined to avoid per-pixel function call overhead
 *    on the dominant unchanged-block fill path.
 * Falls back to a byte-store path when the output buffer's byteOffset is
 * not a multiple of 4 (extremely rare in practice).
 */
function diffWithOutput(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	output: PixelData,
	width: number,
	height: number,
	maxDelta: number,
	alpha: number,
	aaColor: [number, number, number],
	diffColor: [number, number, number],
	diffColorAltOrDiff: [number, number, number],
	excludeAA: boolean,
	diffMask: boolean,
): number {
	if ((output.byteOffset & 3) !== 0) {
		return diffWithOutputBytes(
			image1,
			image2,
			a32,
			b32,
			output,
			width,
			height,
			maxDelta,
			alpha,
			aaColor,
			diffColor,
			diffColorAltOrDiff,
			excludeAA,
			diffMask,
		);
	}

	const len = width * height;
	const out32 = new Uint32Array(output.buffer, output.byteOffset, len);

	const [aaR, aaG, aaB] = aaColor;
	const [diffR, diffG, diffB] = diffColor;
	const [altR, altG, altB] = diffColorAltOrDiff;
	const aaPacked = (aaR | (aaG << 8) | (aaB << 16) | 0xff000000) >>> 0;
	const diffPacked = (diffR | (diffG << 8) | (diffB << 16) | 0xff000000) >>> 0;
	const altPacked = (altR | (altG << 8) | (altB << 16) | 0xff000000) >>> 0;

	const blockSize = calculateOptimalBlockSize(width, height);
	const blocksX = Math.ceil(width / blockSize);
	const blocksY = Math.ceil(height / blockSize);
	const changedBlocks = new Uint16Array(blocksX * blocksY);
	let changedBlocksCount = 0;

	// Anything under this squared channel distance is provably below
	// threshold, see YIQ_LAMBDA_MAX.
	const reject = maxDelta / YIQ_LAMBDA_MAX;

	// Pass 1: find blocks containing at least one above-threshold diff; fill
	// unchanged blocks with gray pixels in the same pass.
	for (let by = 0; by < blocksY; by++) {
		const startY = by * blockSize;
		const yLimit = startY + blockSize;
		const endY = yLimit < height ? yLimit : height;
		for (let bx = 0; bx < blocksX; bx++) {
			const startX = bx * blockSize;
			const xLimit = startX + blockSize;
			const endX = xLimit < width ? xLimit : width;

			let blockHasDiff = false;
			outer: for (let y = startY; y < endY; y++) {
				const yOffset = y * width;
				for (let x = startX; x < endX; x++) {
					const i = yOffset + x;
					const av = a32[i];
					const bv = b32[i];
					if (av === bv) continue;

					const pos = i * 4;

					let dr: number;
					let dg: number;
					let db: number;

					if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
						dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
						dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
						db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
						if (dr * dr + dg * dg + db * db <= reject) continue;
					} else {
						const r1 = image1[pos];
						const g1 = image1[pos + 1];
						const bl1 = image1[pos + 2];
						const a1 = image1[pos + 3];
						const r2 = image2[pos];
						const g2 = image2[pos + 1];
						const bl2 = image2[pos + 2];
						const a2 = image2[pos + 3];
						const da = a1 - a2;
						const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
						const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
						dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
						dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
						db = (bl1 * a1 - bl2 * a2 - bb * da) / 255;
					}

					const yc = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
					const ic = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
					const qc = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
					const dist =
						YIQ_COEFF_Y * yc * yc +
						YIQ_COEFF_I * ic * ic +
						YIQ_COEFF_Q * qc * qc;
					if (dist > maxDelta) {
						blockHasDiff = true;
						break outer;
					}
				}
			}

			if (blockHasDiff) {
				changedBlocks[changedBlocksCount++] = by * blocksX + bx;
			} else if (!diffMask) {
				for (let y = startY; y < endY; y++) {
					const yOffset = y * width;
					for (let x = startX; x < endX; x++) {
						const i = yOffset + x;
						const pos = i * 4;
						const luma =
							image1[pos] * YIQ_Y_R +
							image1[pos + 1] * YIQ_Y_G +
							image1[pos + 2] * YIQ_Y_B;
						const value =
							(255 + ((luma - 255) * alpha * image1[pos + 3]) / 255) | 0;
						out32[i] =
							(value | (value << 8) | (value << 16) | 0xff000000) >>> 0;
					}
				}
			}
		}
	}

	if (changedBlocksCount === 0) return 0;

	let diff = 0;
	for (let blockIdx = 0; blockIdx < changedBlocksCount; blockIdx++) {
		const block = changedBlocks[blockIdx];
		const bx = block % blocksX;
		const by = (block / blocksX) | 0;
		const startX = bx * blockSize;
		const startY = by * blockSize;
		const xLimit = startX + blockSize;
		const yLimit = startY + blockSize;
		const endX = xLimit < width ? xLimit : width;
		const endY = yLimit < height ? yLimit : height;

		for (let y = startY; y < endY; y++) {
			const yOffset = y * width;
			for (let x = startX; x < endX; x++) {
				const i = yOffset + x;
				const pos = i * 4;
				const av = a32[i];
				const bv = b32[i];

				if (av === bv) {
					if (!diffMask) {
						const luma =
							image1[pos] * YIQ_Y_R +
							image1[pos + 1] * YIQ_Y_G +
							image1[pos + 2] * YIQ_Y_B;
						const value =
							(255 + ((luma - 255) * alpha * image1[pos + 3]) / 255) | 0;
						out32[i] =
							(value | (value << 8) | (value << 16) | 0xff000000) >>> 0;
					}
					continue;
				}

				let dr: number;
				let dg: number;
				let db: number;

				if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
					dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
					dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
					db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
					// Provably below threshold: same outcome as the full metric
					// failing the `dist > maxDelta` test, so draw gray and move on.
					if (dr * dr + dg * dg + db * db <= reject) {
						if (!diffMask) {
							const luma =
								image1[pos] * YIQ_Y_R +
								image1[pos + 1] * YIQ_Y_G +
								image1[pos + 2] * YIQ_Y_B;
							const value =
								(255 + ((luma - 255) * alpha * image1[pos + 3]) / 255) | 0;
							out32[i] =
								(value | (value << 8) | (value << 16) | 0xff000000) >>> 0;
						}
						continue;
					}
				} else {
					const r1 = image1[pos];
					const g1 = image1[pos + 1];
					const bl1 = image1[pos + 2];
					const a1 = image1[pos + 3];
					const r2 = image2[pos];
					const g2 = image2[pos + 1];
					const bl2 = image2[pos + 2];
					const a2 = image2[pos + 3];
					const da = a1 - a2;
					const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
					const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
					dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
					dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
					db = (bl1 * a1 - bl2 * a2 - bb * da) / 255;
				}

				const yc = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
				const ic = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
				const qc = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
				const dist =
					YIQ_COEFF_Y * yc * yc + YIQ_COEFF_I * ic * ic + YIQ_COEFF_Q * qc * qc;

				if (dist > maxDelta) {
					if (
						excludeAA &&
						(antialiased(image1, x, y, width, height, a32, b32) ||
							antialiased(image2, x, y, width, height, b32, a32))
					) {
						if (!diffMask) out32[i] = aaPacked;
					} else {
						out32[i] = yc > 0 ? altPacked : diffPacked;
						diff++;
					}
				} else if (!diffMask) {
					const luma =
						image1[pos] * YIQ_Y_R +
						image1[pos + 1] * YIQ_Y_G +
						image1[pos + 2] * YIQ_Y_B;
					const value =
						(255 + ((luma - 255) * alpha * image1[pos + 3]) / 255) | 0;
					out32[i] = (value | (value << 8) | (value << 16) | 0xff000000) >>> 0;
				}
			}
		}
	}

	return diff;
}

/**
 * Misaligned-output fallback for {@link diffWithOutput}. Uses byte stores
 * but otherwise mirrors the optimized path's structure (inlined colorDelta,
 * unsigned-distance comparison, pre-resolved alt color). Only reached when
 * `output.byteOffset` is not a multiple of 4.
 */
function diffWithOutputBytes(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	output: PixelData,
	width: number,
	height: number,
	maxDelta: number,
	alpha: number,
	aaColor: [number, number, number],
	diffColor: [number, number, number],
	diffColorAltOrDiff: [number, number, number],
	excludeAA: boolean,
	diffMask: boolean,
): number {
	const [aaR, aaG, aaB] = aaColor;
	const [diffR, diffG, diffB] = diffColor;
	const [altR, altG, altB] = diffColorAltOrDiff;
	const blockSize = calculateOptimalBlockSize(width, height);
	const blocksX = Math.ceil(width / blockSize);
	const blocksY = Math.ceil(height / blockSize);
	const changedBlocks = new Uint16Array(blocksX * blocksY);
	let changedBlocksCount = 0;

	for (let by = 0; by < blocksY; by++) {
		const startY = by * blockSize;
		const yLimit = startY + blockSize;
		const endY = yLimit < height ? yLimit : height;
		for (let bx = 0; bx < blocksX; bx++) {
			const startX = bx * blockSize;
			const xLimit = startX + blockSize;
			const endX = xLimit < width ? xLimit : width;

			let blockHasDiff = false;
			outer: for (let y = startY; y < endY; y++) {
				const yOffset = y * width;
				for (let x = startX; x < endX; x++) {
					const i = yOffset + x;
					if (a32[i] === b32[i]) continue;
					const delta = colorDelta(image1, image2, i * 4, i * 4);
					if (Math.abs(delta) > maxDelta) {
						blockHasDiff = true;
						break outer;
					}
				}
			}

			if (blockHasDiff) {
				changedBlocks[changedBlocksCount++] = by * blocksX + bx;
			} else if (!diffMask) {
				for (let y = startY; y < endY; y++) {
					const yOffset = y * width;
					for (let x = startX; x < endX; x++) {
						drawGrayPixel(image1, (yOffset + x) * 4, alpha, output);
					}
				}
			}
		}
	}

	if (changedBlocksCount === 0) return 0;

	let diff = 0;
	for (let blockIdx = 0; blockIdx < changedBlocksCount; blockIdx++) {
		const block = changedBlocks[blockIdx];
		const bx = block % blocksX;
		const by = (block / blocksX) | 0;
		const startX = bx * blockSize;
		const startY = by * blockSize;
		const xLimit = startX + blockSize;
		const yLimit = startY + blockSize;
		const endX = xLimit < width ? xLimit : width;
		const endY = yLimit < height ? yLimit : height;

		for (let y = startY; y < endY; y++) {
			const yOffset = y * width;
			for (let x = startX; x < endX; x++) {
				const i = yOffset + x;
				const pos = i * 4;
				if (a32[i] === b32[i]) {
					if (!diffMask) drawGrayPixel(image1, pos, alpha, output);
					continue;
				}
				const delta = colorDelta(image1, image2, pos, pos);
				if (Math.abs(delta) > maxDelta) {
					if (
						excludeAA &&
						(antialiased(image1, x, y, width, height, a32, b32) ||
							antialiased(image2, x, y, width, height, b32, a32))
					) {
						if (!diffMask) drawPixel(output, pos, aaR, aaG, aaB);
					} else {
						if (delta < 0) drawPixel(output, pos, altR, altG, altB);
						else drawPixel(output, pos, diffR, diffG, diffB);
						diff++;
					}
				} else if (!diffMask) {
					drawGrayPixel(image1, pos, alpha, output);
				}
			}
		}
	}

	return diff;
}

/** Check if array is valid pixel data */
export function isValidImage(arr: unknown): arr is PixelData {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}

const LOG2_E = Math.LOG2E;

export function calculateOptimalBlockSize(
	width: number,
	height: number,
): number {
	const area = width * height;

	const scale = Math.sqrt(area) / 100;
	const rawSize = 16 * Math.sqrt(scale);

	// More efficient power-of-2 rounding using bit operations
	const log2Val = Math.log(rawSize) * LOG2_E;
	return 1 << Math.round(log2Val); // Bit shift instead of Math.pow(2, x)
}
/**
 * Calculate color difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function colorDelta(
	image1: PixelData,
	image2: PixelData,
	k: number,
	m: number,
): number {
	const r1 = image1[k];
	const g1 = image1[k + 1];
	const b1 = image1[k + 2];
	const a1 = image1[k + 3];
	const r2 = image2[m];
	const g2 = image2[m + 1];
	const b2 = image2[m + 2];
	const a2 = image2[m + 3];

	let dr = r1 - r2;
	let dg = g1 - g2;
	let db = b1 - b2;
	const da = a1 - a2;

	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// blend pixels with background
		const rb = 48 + 159 * (k & 1);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	const y = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
	const i = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
	const q = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
	const delta = YIQ_COEFF_Y * y * y + YIQ_COEFF_I * i * i + YIQ_COEFF_Q * q * q;

	// encode whether the pixel lightens or darkens in the sign
	return y > 0 ? -delta : delta;
}

/**
 * Draw a grayscale pixel to the output buffer
 */
export function drawGrayPixel(
	image: PixelData,
	index: number,
	alpha: number,
	output: PixelData,
): void {
	const luma =
		image[index] * YIQ_Y_R +
		image[index + 1] * YIQ_Y_G +
		image[index + 2] * YIQ_Y_B;
	const value = 255 + ((luma - 255) * alpha * image[index + 3]) / 255;
	drawPixel(output, index, value, value, value);
}

/**
 * Draw a colored pixel to the output buffer
 */
export function drawPixel(
	output: PixelData,
	position: number,
	r: number,
	g: number,
	b: number,
): void {
	output[position + 0] = r;
	output[position + 1] = g;
	output[position + 2] = b;
	output[position + 3] = 255;
}

/**
 * Specialized count-only path used when no output buffer is requested.
 * Single tight loop with inlined colorDelta and squared-distance comparison
 * (no Math.abs round-trip; sign is irrelevant when no diff color must be
 * chosen). Equivalent in behavior to the two-pass block path but with less
 * memory traffic and fewer branches per pixel.
 */
function diffCountOnly(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	height: number,
	maxDelta: number,
	excludeAA: boolean,
): number {
	// Anything under this squared channel distance is provably below
	// threshold, see YIQ_LAMBDA_MAX.
	const reject = maxDelta / YIQ_LAMBDA_MAX;

	let diff = 0;
	for (let y = 0; y < height; y++) {
		const rowStart = y * width;
		for (let x = 0; x < width; x++) {
			const i = rowStart + x;
			const av = a32[i];
			const bv = b32[i];
			// Fast Uint32 equality — 1 compare per pixel instead of 4.
			if (av === bv) continue;

			const pos = i * 4;

			// Inlined colorDelta (returns squared YIQ distance; sign skipped
			// since alt color isn't needed in count-only mode).
			let dr: number;
			let dg: number;
			let db: number;

			if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
				// Both pixels opaque (the overwhelmingly common case): the
				// channels come out of the words already loaded above, so the
				// 8 byte loads disappear entirely.
				dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
				dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
				db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
				if (dr * dr + dg * dg + db * db <= reject) continue;
			} else {
				const r1 = image1[pos];
				const g1 = image1[pos + 1];
				const bl1 = image1[pos + 2];
				const a1 = image1[pos + 3];
				const r2 = image2[pos];
				const g2 = image2[pos + 1];
				const bl2 = image2[pos + 2];
				const a2 = image2[pos + 3];
				const da = a1 - a2;
				// pos is always a multiple of 4 here, so pos % 2 === 0 → rb=48.
				const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
				const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
				dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
				dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
				db = (bl1 * a1 - bl2 * a2 - bb * da) / 255;
			}

			const yc = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
			const ic = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
			const qc = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
			const dist =
				YIQ_COEFF_Y * yc * yc + YIQ_COEFF_I * ic * ic + YIQ_COEFF_Q * qc * qc;

			if (dist > maxDelta) {
				if (
					excludeAA &&
					(antialiased(image1, x, y, width, height, a32, b32) ||
						antialiased(image2, x, y, width, height, b32, a32))
				) {
					continue;
				}
				diff++;
			}
		}
	}
	return diff;
}

/**
 * Block-based count-only path used for very large images (typically tall
 * page screenshots with sparse diffs). Pass 1 partitions the image into
 * blocks and identifies which ones contain any above-threshold diff via an
 * early-exit per-block scan. Pass 2 then re-walks only those blocks for
 * AA-aware diff counting. For sparse-diff images this avoids running the
 * AA-detection branch on tens of millions of identical pixels.
 *
 * Differences from {@link diff}'s full path:
 *  - colorDelta is inlined in both passes,
 *  - Math.abs(delta) > maxDelta is replaced with a direct unsigned-distance
 *    comparison (sign isn't needed without a diff color to choose),
 *  - AA detection uses {@link antialiasedInline} with the center pixel's
 *    RGBA pre-hoisted out of the 8-neighbor loop,
 *  - all output-buffer branches are removed.
 */
function diffCountOnlyBlocked(
	image1: PixelData,
	image2: PixelData,
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	height: number,
	maxDelta: number,
	excludeAA: boolean,
): number {
	const blockSize = calculateOptimalBlockSize(width, height);
	const blocksX = Math.ceil(width / blockSize);
	const blocksY = Math.ceil(height / blockSize);
	const maxBlocks = blocksX * blocksY;
	// Uint16 is enough for realistic image sizes (≤65k blocks ≈ ~16M px @ 16²
	// or ~1Gpx @ 128²). Same shape as the regular path's `changedBlocks`.
	const changedBlocks = new Uint16Array(maxBlocks);
	let changedBlocksCount = 0;

	// Anything under this squared channel distance is provably below
	// threshold, see YIQ_LAMBDA_MAX.
	const reject = maxDelta / YIQ_LAMBDA_MAX;

	for (let by = 0; by < blocksY; by++) {
		const startY = by * blockSize;
		const yLimit = startY + blockSize;
		const endY = yLimit < height ? yLimit : height;
		for (let bx = 0; bx < blocksX; bx++) {
			const startX = bx * blockSize;
			const xLimit = startX + blockSize;
			const endX = xLimit < width ? xLimit : width;

			let blockHasDiff = false;
			outer: for (let y = startY; y < endY; y++) {
				const yOffset = y * width;
				for (let x = startX; x < endX; x++) {
					const i = yOffset + x;
					const av = a32[i];
					const bv = b32[i];
					if (av === bv) continue;

					const pos = i * 4;

					let dr: number;
					let dg: number;
					let db: number;

					if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
						dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
						dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
						db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
						if (dr * dr + dg * dg + db * db <= reject) continue;
					} else {
						const r1 = image1[pos];
						const g1 = image1[pos + 1];
						const bl1 = image1[pos + 2];
						const a1 = image1[pos + 3];
						const r2 = image2[pos];
						const g2 = image2[pos + 1];
						const bl2 = image2[pos + 2];
						const a2 = image2[pos + 3];
						const da = a1 - a2;
						const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
						const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
						dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
						dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
						db = (bl1 * a1 - bl2 * a2 - bb * da) / 255;
					}

					const yc = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
					const ic = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
					const qc = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;
					const dist = 0.5053 * yc * yc + 0.299 * ic * ic + 0.1957 * qc * qc;
					if (dist > maxDelta) {
						blockHasDiff = true;
						break outer;
					}
				}
			}

			if (blockHasDiff) {
				changedBlocks[changedBlocksCount++] = by * blocksX + bx;
			}
		}
	}

	if (changedBlocksCount === 0) return 0;

	let diff = 0;
	for (let blockIdx = 0; blockIdx < changedBlocksCount; blockIdx++) {
		const block = changedBlocks[blockIdx];
		const bx = block % blocksX;
		const by = (block / blocksX) | 0;
		const startX = bx * blockSize;
		const startY = by * blockSize;
		const xLimit = startX + blockSize;
		const yLimit = startY + blockSize;
		const endX = xLimit < width ? xLimit : width;
		const endY = yLimit < height ? yLimit : height;

		for (let y = startY; y < endY; y++) {
			const yOffset = y * width;
			for (let x = startX; x < endX; x++) {
				const i = yOffset + x;
				const av = a32[i];
				const bv = b32[i];
				if (av === bv) continue;

				const pos = i * 4;

				let dr: number;
				let dg: number;
				let db: number;

				if ((((av & bv) >>> SHIFT_A) & 0xff) === 0xff) {
					dr = ((av >>> SHIFT_R) & 0xff) - ((bv >>> SHIFT_R) & 0xff);
					dg = ((av >>> SHIFT_G) & 0xff) - ((bv >>> SHIFT_G) & 0xff);
					db = ((av >>> SHIFT_B) & 0xff) - ((bv >>> SHIFT_B) & 0xff);
					if (dr * dr + dg * dg + db * db <= reject) continue;
				} else {
					const r1 = image1[pos];
					const g1 = image1[pos + 1];
					const bl1 = image1[pos + 2];
					const a1 = image1[pos + 3];
					const r2 = image2[pos];
					const g2 = image2[pos + 1];
					const bl2 = image2[pos + 2];
					const a2 = image2[pos + 3];
					const da = a1 - a2;
					const gb = 48 + 159 * (((pos / 1.618033988749895) | 0) & 1);
					const bb = 48 + 159 * (((pos / 2.618033988749895) | 0) & 1);
					dr = (r1 * a1 - r2 * a2 - 48 * da) / 255;
					dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
					db = (bl1 * a1 - bl2 * a2 - bb * da) / 255;
				}

				const yc = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
				const ic = dr * YIQ_I_R + dg * YIQ_I_G + db * YIQ_I_B;
				const qc = dr * YIQ_Q_R + dg * YIQ_Q_G + db * YIQ_Q_B;
				const dist =
					YIQ_COEFF_Y * yc * yc + YIQ_COEFF_I * ic * ic + YIQ_COEFF_Q * qc * qc;

				if (dist > maxDelta) {
					if (
						excludeAA &&
						(antialiased(image1, x, y, width, height, a32, b32) ||
							antialiased(image2, x, y, width, height, b32, a32))
					) {
						continue;
					}
					diff++;
				}
			}
		}
	}

	return diff;
}
