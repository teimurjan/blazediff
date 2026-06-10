export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export interface CoreOptions {
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	aaColor?: [number, number, number];
	diffColor?: [number, number, number];
	diffColorAlt?: [number, number, number];
	diffMask?: boolean;
	fastBufferCheck?: boolean;
}

/**
 * Compare two images pixel-by-pixel and return the number of different pixels.
 *
 * Uses YIQ color space for perceptually accurate color comparison and includes
 * anti-aliasing detection. Implements block-based optimization for 20% better
 * performance than traditional pixel-by-pixel comparison.
 *
 * @param image1 - First image data (RGBA format, 4 bytes per pixel)
 * @param image2 - Second image data (RGBA format, 4 bytes per pixel)
 * @param output - Optional output buffer for diff visualization. If provided, will be filled with:
 *                 - Grayscale for unchanged pixels (with alpha blending)
 *                 - aaColor for anti-aliased pixels (if includeAA is false)
 *                 - diffColor/diffColorAlt for different pixels
 *                 - Transparent for unchanged pixels (if diffMask is true)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param options - Comparison options
 * @param options.threshold - Color difference threshold (0-1). Lower values = more sensitive.
 *                           Default: 0.1. Recommended: 0.05 for strict, 0.2+ for loose.
 * @param options.alpha - Background opacity for unchanged pixels in output (0-1). Default: 0.1
 * @param options.aaColor - RGB color for anti-aliased pixels. Default: [255, 255, 0] (yellow)
 * @param options.diffColor - RGB color for different pixels. Default: [255, 0, 0] (red)
 * @param options.diffColorAlt - Optional RGB color for dark differences. Helps distinguish
 *                               lightening vs darkening changes.
 * @param options.includeAA - Whether to count anti-aliased pixels as differences. Default: false
 * @param options.diffMask - If true, output only shows differences (transparent background).
 *                          Useful for overlay masks. Default: false
 * @param options.fastBufferCheck - Use Buffer.compare() for fast identical-buffer detection.
 *                                  Set to false if images are processed differently but look similar.
 *                                  Default: true
 * @returns The number of different pixels (excluding anti-aliased pixels unless includeAA is true)
 *
 * @throws {Error} If image data is not Uint8Array, Uint8ClampedArray, or Buffer
 * @throws {Error} If image sizes don't match
 * @throws {Error} If image data size doesn't match width × height × 4
 *
 * @example
 * ```typescript
 * import { diff } from '@blazediff/core';
 *
 * // Basic comparison
 * const diffCount = diff(image1, image2, undefined, 800, 600);
 *
 * // With visualization output
 * const output = new Uint8ClampedArray(800 * 600 * 4);
 * const diffCount = diff(image1, image2, output, 800, 600, {
 *   threshold: 0.1,
 *   diffColor: [255, 0, 0],
 *   aaColor: [255, 255, 0]
 * });
 *
 * // Strict comparison with diff mask
 * const diffCount = diff(image1, image2, output, 800, 600, {
 *   threshold: 0.05,
 *   diffMask: true,
 *   includeAA: true
 * });
 * ```
 *
 * @see {@link https://blazediff.dev | Documentation}
 * @see {@link ./FORMULA.md | Algorithm and Mathematical Foundation}
 */
export function diff(
	image1: Image["data"],
	image2: Image["data"],
	output: Image["data"] | null | undefined,
	width: number,
	height: number,
	{
		threshold = 0.1,
		alpha = 0.1,
		aaColor = [255, 255, 0],
		diffColor = [255, 0, 0],
		includeAA,
		diffColorAlt,
		diffMask,
		fastBufferCheck = true,
	}: CoreOptions = {},
): number {
	if (
		!isValidImage(image1) ||
		!isValidImage(image2) ||
		(output && !isValidImage(output))
	)
		throw new Error(
			"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
		);

	if (
		image1.length !== image2.length ||
		(output && output.length !== image1.length)
	)
		throw new Error(
			`Image sizes do not match. Image 1 size: ${image1.length}, image 2 size: ${image2.length}`,
		);

	if (image1.length !== width * height * 4)
		throw new Error(
			`Image data size does not match width/height. Expecting ${
				width * height * 4
			}. Got ${image1.length}`,
		);

	const len = width * height;

	// Fast buffer identical check
	if (
		fastBufferCheck &&
		typeof Buffer !== "undefined" &&
		Buffer.compare &&
		image1 instanceof Uint8Array &&
		image2 instanceof Uint8Array &&
		Buffer.compare(image1, image2) === 0
	) {
		if (output && !diffMask) {
			fillGray(image1, output, len, alpha);
		}
		return 0;
	}

	const a32 = new Uint32Array(image1.buffer, image1.byteOffset, len);
	const b32 = new Uint32Array(image2.buffer, image2.byteOffset, len);

	// Maximum acceptable square distance between two colors;
	// 35215 is the maximum possible value for the YIQ difference metric
	const maxDelta = 35215 * threshold * threshold;

	// Scans are routed by byte-diff density (~4k-sample probe). Sparse pairs
	// (the common VRT case) win with the 4-pixel wide-skip scan; dense pairs
	// (e.g. photos, where ~no 4-pixel group is identical) would pay pure
	// overhead for it, so the skip is disabled. Very large dense images
	// (40Mpx+ page screenshots with sub-threshold compression noise) take
	// the block-tiled two-pass count, which is ~25% faster there than any
	// single pass. All variants share the same inlined-colorDelta hot loop.
	const sparse = !isDenseByteDiff(a32, b32, len);

	if (output == null) {
		if (!sparse && len >= 30_000_000) {
			return diffCountOnlyBlocked(
				image1,
				image2,
				a32,
				b32,
				width,
				height,
				maxDelta,
				!includeAA,
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
			!includeAA,
			sparse,
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
		diffColorAlt || diffColor,
		!includeAA,
		!!diffMask,
		sparse,
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
	image: Image["data"],
	output: Image["data"],
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
	image1: Image["data"],
	image2: Image["data"],
	a32: Uint32Array,
	b32: Uint32Array,
	output: Image["data"],
	width: number,
	height: number,
	maxDelta: number,
	alpha: number,
	aaColor: [number, number, number],
	diffColor: [number, number, number],
	diffColorAltOrDiff: [number, number, number],
	excludeAA: boolean,
	diffMask: boolean,
	sparse: boolean,
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
				const rowEnd = yOffset + endX;
				const rowEnd4 = rowEnd - 3;
				let i = yOffset + startX;
				while (i < rowEnd) {
					// Same 4-pixel XOR-OR wide skip as the count-only path,
					// bounded to the current block row and disabled for dense
					// pairs.
					if (sparse)
						while (
							i < rowEnd4 &&
							((a32[i] ^ b32[i]) |
								(a32[i + 1] ^ b32[i + 1]) |
								(a32[i + 2] ^ b32[i + 2]) |
								(a32[i + 3] ^ b32[i + 3])) ===
								0
						)
							i += 4;
					// Dense pairs scan the whole row segment in one inner loop.
					const stop = sparse ? (i + 4 < rowEnd ? i + 4 : rowEnd) : rowEnd;
					for (; i < stop; i++) {
						if (a32[i] === b32[i]) continue;

						const pos = i * 4;
						const r1 = image1[pos];
						const g1 = image1[pos + 1];
						const bl1 = image1[pos + 2];
						const a1 = image1[pos + 3];
						const r2 = image2[pos];
						const g2 = image2[pos + 1];
						const bl2 = image2[pos + 2];
						const a2 = image2[pos + 3];

						let dr = r1 - r2;
						let dg = g1 - g2;
						let db = bl1 - bl2;
						if (a1 < 255 || a2 < 255) {
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

				if (a32[i] === b32[i]) {
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

				const r1 = image1[pos];
				const g1 = image1[pos + 1];
				const bl1 = image1[pos + 2];
				const a1 = image1[pos + 3];
				const r2 = image2[pos];
				const g2 = image2[pos + 1];
				const bl2 = image2[pos + 2];
				const a2 = image2[pos + 3];

				let dr = r1 - r2;
				let dg = g1 - g2;
				let db = bl1 - bl2;
				if (a1 < 255 || a2 < 255) {
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
	image1: Image["data"],
	image2: Image["data"],
	a32: Uint32Array,
	b32: Uint32Array,
	output: Image["data"],
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

/**
 * Estimate whether two images differ on more than ~25% of pixels at the
 * byte level by sampling ~4096 evenly-spaced 32-bit pixels. Above that
 * density, fully-identical 4-pixel groups become rare ((1-d)^4 < ⅓), so the
 * wide-skip scan stops paying for itself. Used to route the count-only path.
 */
function isDenseByteDiff(
	a32: Uint32Array,
	b32: Uint32Array,
	len: number,
): boolean {
	const stride = len > 4096 ? (len / 4096) | 0 : 1;
	let samples = 0;
	let mismatches = 0;
	for (let i = 0; i < len; i += stride) {
		samples++;
		if (a32[i] !== b32[i]) mismatches++;
	}
	return mismatches * 4 > samples;
}

/** Check if array is valid pixel data */
export function isValidImage(arr: unknown): arr is Image["data"] {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}

const LOG2_E = Math.LOG2E;

// Pre-computed YIQ coefficients for fast access
const YIQ_Y_R = 0.29889531;
const YIQ_Y_G = 0.58662247;
const YIQ_Y_B = 0.11448223;
const YIQ_I_R = 0.59597799;
const YIQ_I_G = -0.2741761;
const YIQ_I_B = -0.32180189;
const YIQ_Q_R = 0.21147017;
const YIQ_Q_G = -0.52261711;
const YIQ_Q_B = 0.31114694;
const YIQ_COEFF_Y = 0.5053;
const YIQ_COEFF_I = 0.299;
const YIQ_COEFF_Q = 0.1957;
// More efficient than Math.log2()

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
	image1: Image["data"],
	image2: Image["data"],
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
 * Calculate brightness difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function brightnessDelta(
	image1: Image["data"],
	image2: Image["data"],
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

	// same as in colorDelta
	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// *** EXACT COPY of your alpha+bg code ***
		const rb = 48 + 159 * (k % 2);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	// same y as in colorDelta
	const y = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
	return y;
}

/**
 * Check if a pixel is likely a part of anti-aliasing;
 * based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009
 */
export function antialiased(
	image: Image["data"],
	x1: number,
	y1: number,
	width: number,
	height: number,
	a32: Uint32Array,
	b32: Uint32Array,
): boolean {
	const x0 = Math.max(x1 - 1, 0);
	const y0 = Math.max(y1 - 1, 0);
	const x2 = Math.min(x1 + 1, width - 1);
	const y2 = Math.min(y1 + 1, height - 1);
	const pos = y1 * width + x1;
	const centerVal = a32[pos];
	const k = pos * 4;
	// Center pixel channels and background blend constants are loop
	// invariants of the 8-neighbor scan (brightnessDelta recomputed them per
	// neighbor). `a32` is the Uint32 view of `image` at every call site.
	const r1 = image[k];
	const g1 = image[k + 1];
	const b1 = image[k + 2];
	const a1 = image[k + 3];
	const rb = 48 + 159 * (k & 1);
	const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
	const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
	let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
	let min = 0;
	let max = 0;
	let minX = 0;
	let minY = 0;
	let maxX = 0;
	let maxY = 0;

	// Go through 8 adjacent pixels
	for (let x = x0; x <= x2; x++) {
		for (let y = y0; y <= y2; y++) {
			if (x === x1 && y === y1) continue;

			const npos = y * width + x;
			// Identical RGBA → brightness delta is exactly 0 (same result as
			// brightnessDelta's all-channels-equal early return), without the
			// float math. Flat regions exit via `zeroes > 2` after 3 compares.
			if (a32[npos] === centerVal) {
				zeroes++;
				// If found more than 2 equal siblings, it's definitely not anti-aliasing
				if (zeroes > 2) return false;
				continue;
			}

			// Inlined brightnessDelta(image, image, k, m) — identical
			// arithmetic, center side hoisted above.
			const m = npos * 4;
			const r2 = image[m];
			const g2 = image[m + 1];
			const b2 = image[m + 2];
			const a2 = image[m + 3];
			let dr = r1 - r2;
			let dg = g1 - g2;
			let db = b1 - b2;
			if (a1 < 255 || a2 < 255) {
				const da = a1 - a2;
				dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
				dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
				db = (b1 * a1 - b2 * a2 - bb * da) / 255;
			}
			const delta = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;

			// Count the number of equal, darker and brighter adjacent pixels
			if (delta === 0) {
				zeroes++;
				// If found more than 2 equal siblings, it's definitely not anti-aliasing
				if (zeroes > 2) return false;

				// Remember the darkest pixel
			} else if (delta < min) {
				min = delta;
				minX = x;
				minY = y;

				// Remember the brightest pixel
			} else if (delta > max) {
				max = delta;
				maxX = x;
				maxY = y;
			}
		}
	}

	// Of there are no both darker and brighter pixels among siblings, it's not anti-aliasing
	if (min === 0 || max === 0) return false;

	// If either the darkest or the brightest pixel has 3+ equal siblings in both images
	// (definitely not anti-aliased), this pixel is anti-aliased
	return (
		(hasManySiblings(a32, minX, minY, width, height) &&
			hasManySiblings(b32, minX, minY, width, height)) ||
		(hasManySiblings(a32, maxX, maxY, width, height) &&
			hasManySiblings(b32, maxX, maxY, width, height))
	);
}

/**
 * Check if a pixel has 3+ adjacent pixels of the same color.
 */
function hasManySiblings(
	image: Uint32Array,
	x1: number,
	y1: number,
	width: number,
	height: number,
): boolean {
	const pos = y1 * width + x1;
	const val = image[pos];
	const isOnBoundary =
		x1 === 0 || x1 === width - 1 || y1 === 0 || y1 === height - 1;
	let count = isOnBoundary ? 1 : 0;

	// Check all 8 neighbors with bounds checking
	// Top row
	if (y1 > 0) {
		const topRow = pos - width;
		if (x1 > 0 && image[topRow - 1] === val) count++;
		if (image[topRow] === val) count++;
		if (x1 < width - 1 && image[topRow + 1] === val) count++;
	}

	// Middle row (left and right)
	if (x1 > 0 && image[pos - 1] === val) count++;
	if (x1 < width - 1 && image[pos + 1] === val) count++;

	// Bottom row
	if (y1 < height - 1) {
		const bottomRow = pos + width;
		if (x1 > 0 && image[bottomRow - 1] === val) count++;
		if (image[bottomRow] === val) count++;
		if (x1 < width - 1 && image[bottomRow + 1] === val) count++;
	}

	return count > 2;
}

/**
 * Draw a grayscale pixel to the output buffer
 */
export function drawGrayPixel(
	image: Image["data"],
	index: number,
	alpha: number,
	output: Image["data"],
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
	output: Image["data"],
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
	image1: Image["data"],
	image2: Image["data"],
	a32: Uint32Array,
	b32: Uint32Array,
	width: number,
	height: number,
	maxDelta: number,
	excludeAA: boolean,
	sparse: boolean,
): number {
	let diff = 0;
	const len = width * height;
	const len4 = len & ~3;
	let i = 0;
	while (i < len) {
		// Wide skip: identical regions cost 1 branch per 4 pixels. XOR-OR of
		// four 32-bit lanes is zero iff all four pixel pairs are identical.
		// Disabled for dense pairs, where groups ~never match and the XOR
		// test would be pure overhead.
		if (sparse)
			while (
				i < len4 &&
				((a32[i] ^ b32[i]) |
					(a32[i + 1] ^ b32[i + 1]) |
					(a32[i + 2] ^ b32[i + 2]) |
					(a32[i + 3] ^ b32[i + 3])) ===
					0
			)
				i += 4;
		// Dense pairs scan the whole range in one inner loop — the structure
		// degenerates to a plain per-pixel pass with no per-group overhead.
		const stop = sparse ? (i + 4 < len ? i + 4 : len) : len;
		for (; i < stop; i++) {
			if (a32[i] === b32[i]) continue;

			const pos = i * 4;

			// Inlined colorDelta (returns squared YIQ distance; sign skipped
			// since alt color isn't needed in count-only mode).
			const r1 = image1[pos];
			const g1 = image1[pos + 1];
			const bl1 = image1[pos + 2];
			const a1 = image1[pos + 3];
			const r2 = image2[pos];
			const g2 = image2[pos + 1];
			const bl2 = image2[pos + 2];
			const a2 = image2[pos + 3];

			let dr = r1 - r2;
			let dg = g1 - g2;
			let db = bl1 - bl2;

			if (a1 < 255 || a2 < 255) {
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
				if (excludeAA) {
					const x = i % width;
					const y = (i / width) | 0;
					if (
						antialiased(image1, x, y, width, height, a32, b32) ||
						antialiased(image2, x, y, width, height, b32, a32)
					) {
						continue;
					}
				}
				diff++;
			}
		}
	}
	return diff;
}

/**
 * Block-tiled count-only path for very large dense-diff images (40Mpx+ page
 * screenshots with sub-threshold compression noise), where it beats the
 * single-pass scan by ~25%. Pass 1 partitions the image into blocks and
 * identifies which ones contain any above-threshold diff via an early-exit
 * per-block scan. Pass 2 then re-walks only those blocks for AA-aware diff
 * counting.
 *
 * Differences from {@link diffWithOutput}:
 *  - colorDelta is inlined in both passes,
 *  - Math.abs(delta) > maxDelta is replaced with a direct unsigned-distance
 *    comparison (sign isn't needed without a diff color to choose),
 *  - all output-buffer branches are removed,
 *  - no wide skip: this path is only reached for dense pairs, where the
 *    XOR-OR group test would be pure overhead.
 */
function diffCountOnlyBlocked(
	image1: Image["data"],
	image2: Image["data"],
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

					const pos = i * 4;
					const r1 = image1[pos];
					const g1 = image1[pos + 1];
					const bl1 = image1[pos + 2];
					const a1 = image1[pos + 3];
					const r2 = image2[pos];
					const g2 = image2[pos + 1];
					const bl2 = image2[pos + 2];
					const a2 = image2[pos + 3];

					let dr = r1 - r2;
					let dg = g1 - g2;
					let db = bl1 - bl2;

					if (a1 < 255 || a2 < 255) {
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
				if (a32[i] === b32[i]) continue;

				const pos = i * 4;
				const r1 = image1[pos];
				const g1 = image1[pos + 1];
				const bl1 = image1[pos + 2];
				const a1 = image1[pos + 3];
				const r2 = image2[pos];
				const g2 = image2[pos + 1];
				const bl2 = image2[pos + 2];
				const a2 = image2[pos + 3];

				let dr = r1 - r2;
				let dg = g1 - g2;
				let db = bl1 - bl2;

				if (a1 < 255 || a2 < 255) {
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

export default diff;
