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
	output: Image["data"] | undefined,
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
			for (let i = 0; i < width * height; i++) {
				drawGrayPixel(image1, i * 4, alpha, output);
			}
		}
		return 0;
	}

	const len = width * height;
	const a32 = new Uint32Array(image1.buffer, image1.byteOffset, len);
	const b32 = new Uint32Array(image2.buffer, image2.byteOffset, len);
	const blockSize = calculateOptimalBlockSize(width, height);

	const blocksX = Math.ceil(width / blockSize);
	const blocksY = Math.ceil(height / blockSize);

	const maxBlocks = blocksX * blocksY;
	// Store single block index instead of x,y pairs - halves memory bandwidth
	const changedBlocks = new Uint16Array(maxBlocks);

	// Maximum acceptable square distance between two colors;
	// 35215 is the maximum possible value for the YIQ difference metric
	const maxDelta = 35215 * threshold * threshold;

	let changedBlocksCount = 0;

	for (let by = 0; by < blocksY; by++) {
		for (let bx = 0; bx < blocksX; bx++) {
			const startX = bx * blockSize;
			const startY = by * blockSize;
			const endX = Math.min(startX + blockSize, width);
			const endY = Math.min(startY + blockSize, height);

			let blockHasDiff = false;

			// Check block using YIQ perceptual threshold (with early exit)
			outer: for (let y = startY; y < endY; y++) {
				const yOffset = y * width;
				for (let x = startX; x < endX; x++) {
					const i = yOffset + x;
					// Fast path: skip identical pixels
					if (a32[i] === b32[i]) continue;
					// Check if perceptually different
					const pos = i * 4;
					const delta = colorDelta(image1, image2, pos, pos, false);
					if (Math.abs(delta) > maxDelta) {
						blockHasDiff = true;
						break outer;
					}
				}
			}

			if (!blockHasDiff) {
				// Draw gray pixels for perceptually identical blocks
				if (output && !diffMask) {
					for (let y = startY; y < endY; y++) {
						const yOffset = y * width;
						for (let x = startX; x < endX; x++) {
							const i = yOffset + x;
							drawGrayPixel(image1, i * 4, alpha, output);
						}
					}
				}
			} else {
				// Store block index - compute coordinates when needed
				changedBlocks[changedBlocksCount++] = by * blocksX + bx;
			}
		}
	}

	// Early exit if no changed blocks
	if (changedBlocksCount === 0) {
		return 0;
	}
	const [aaR, aaG, aaB] = aaColor;
	const [diffR, diffG, diffB] = diffColor;
	const [altR, altG, altB] = diffColorAlt || diffColor;
	let diff = 0;

	// Process only changed blocks
	for (let blockIdx = 0; blockIdx < changedBlocksCount; blockIdx++) {
		const block = changedBlocks[blockIdx];
		const bx = block % blocksX;
		const by = (block / blocksX) | 0;
		const startX = bx * blockSize;
		const startY = by * blockSize;
		const endX = Math.min(startX + blockSize, width);
		const endY = Math.min(startY + blockSize, height);

		for (let y = startY; y < endY; y++) {
			const yOffset = y * width;
			for (let x = startX; x < endX; x++) {
				const pixelIndex = yOffset + x;
				const pos = pixelIndex * 4;

				// Skip if pixels are identical
				if (a32[pixelIndex] === b32[pixelIndex]) {
					if (output && !diffMask) {
						drawGrayPixel(image1, pos, alpha, output);
					}
					continue;
				}

				const delta = colorDelta(image1, image2, pos, pos, false);

				// Color difference is above threshold
				if (Math.abs(delta) > maxDelta) {
					// Check it's a real rendering difference or just anti-aliasing
					const isExcludedAA =
						!includeAA &&
						(antialiased(image1, x, y, width, height, a32, b32) ||
							antialiased(image2, x, y, width, height, b32, a32));
					if (isExcludedAA) {
						// One of the pixels is anti-aliasing
						if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
					} else {
						// Found significant difference not caused by anti-aliasing
						if (output) {
							if (delta < 0) {
								drawPixel(output, pos, altR, altG, altB);
							} else {
								drawPixel(output, pos, diffR, diffG, diffB);
							}
						}
						diff++;
					}
				} else if (output && !diffMask) {
					// Pixels are similar
					drawGrayPixel(image1, pos, alpha, output);
				}
			}
		}
	}

	return diff;
}

const LOG2_E = Math.LOG2E; // More efficient than Math.log2()

function calculateOptimalBlockSize(width: number, height: number): number {
	const area = width * height;

	const scale = Math.sqrt(area) / 100;
	const rawSize = 16 * Math.sqrt(scale);

	// More efficient power-of-2 rounding using bit operations
	const log2Val = Math.log(rawSize) * LOG2_E;
	return 1 << Math.round(log2Val); // Bit shift instead of Math.pow(2, x)
}

/** Check if array is valid pixel data */
function isValidImage(arr: unknown): arr is Image["data"] {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}

/**
 * Check if a pixel is likely a part of anti-aliasing;
 * based on "Anti-aliased Pixel and Intensity Slope Detector" paper by V. Vysniauskas, 2009
 */
function antialiased(
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
	const centerPixelOffset = pos * 4;
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

			// Brightness delta between the center pixel and adjacent one
			const delta = colorDelta(
				image,
				image,
				centerPixelOffset,
				(y * width + x) * 4,
				true,
			);

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

	// Start with 1 if on boundary (matching original logic)
	let count =
		x1 === 0 || x1 === width - 1 || y1 === 0 || y1 === height - 1 ? 1 : 0;

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
 * Calculate color difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
function colorDelta(
	image1: Image["data"],
	image2: Image["data"],
	k: number,
	m: number,
	yOnly: boolean,
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
		const rb = 48 + 159 * (k % 2);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

	if (yOnly) return y; // brightness difference only

	const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
	const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

	const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

	// encode whether the pixel lightens or darkens in the sign
	return y > 0 ? -delta : delta;
}

/**
 * Draw a colored pixel to the output buffer
 */
function drawPixel(
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
 * Draw a grayscale pixel to the output buffer
 */
function drawGrayPixel(
	image: Image["data"],
	index: number,
	alpha: number,
	output: Image["data"],
): void {
	const value =
		255 +
		((image[index] * 0.29889531 +
			image[index + 1] * 0.58662247 +
			image[index + 2] * 0.11448223 -
			255) *
			alpha *
			image[index + 3]) /
			255;
	drawPixel(output, index, value, value, value);
}

export default diff;
