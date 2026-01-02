import { antialiased } from "./antialiased";
import { calculateOptimalBlockSize } from "./calculate-optimal-block-size";
import { colorDelta } from "./color-delta";
import { drawGrayPixel, drawPixel } from "./draw-pixel";
import { isValidImage } from "./is-valid-image";
import type { Image } from "./types";

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
					const delta = colorDelta(image1, image2, pos, pos);
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

				const delta = colorDelta(image1, image2, pos, pos);

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

export default diff;
