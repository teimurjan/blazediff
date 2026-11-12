/**
 * Drop-in for pixelmatch 8.0.0: same signature, options, errors, counts and
 * output bytes, OKLab included.
 *
 * @example
 * ```ts
 * import pixelmatch from "@blazediff/core/pixelmatch";
 * const count = pixelmatch(img1, img2, output, width, height, { threshold: 0.1 });
 * ```
 *
 * @module
 */
import { diffPixels, isValidImage } from "./engine";
import type { PixelData, Rgb, WindowHit } from "./types";
import { windowSide } from "./window";

export interface PixelmatchOptions {
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	aaColor?: Rgb;
	diffColor?: Rgb;
	diffColorAlt?: Rgb;
	diffMask?: boolean;
	checkerboard?: boolean;
	windowSize?: number;
	ignoreMask?: PixelData;
}

/** Number of mismatched pixels, or the busiest N×N window's count when `windowSize` is finite. */
export function pixelmatch(
	img1: PixelData,
	img2: PixelData,
	output: PixelData | null | undefined,
	width: number,
	height: number,
	options: PixelmatchOptions = {},
): number {
	const {
		threshold = 0.1,
		alpha = 0.1,
		aaColor = [255, 255, 0],
		diffColor = [255, 0, 0],
		checkerboard = true,
		windowSize = Number.POSITIVE_INFINITY,
		includeAA,
		diffColorAlt,
		diffMask,
		ignoreMask,
	} = options;

	if (
		!isValidImage(img1) ||
		!isValidImage(img2) ||
		(output && !isValidImage(output)) ||
		(ignoreMask && !isValidImage(ignoreMask))
	)
		throw new Error(
			"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
		);
	if (img1.length !== img2.length || (output && output.length !== img1.length))
		throw new Error(
			`Image sizes do not match. Image 1 size: ${img1.length}, image 2 size: ${img2.length}`,
		);
	const len = width * height;
	if (img1.length !== len * 4)
		throw new Error(
			`Image data size does not match width/height. Expecting ${len * 4}. Got ${img1.length}`,
		);
	if (ignoreMask && ignoreMask.length !== len)
		throw new Error(
			`Ignore mask size does not match image width/height. Expecting ${len}. Got ${ignoreMask.length}`,
		);

	const side = windowSide(windowSize, width, height);
	const hit: WindowHit = { x: 0, y: 0, count: 0 };
	const count = diffPixels(
		img1,
		img2,
		output ?? undefined,
		width,
		height,
		{
			threshold,
			alpha,
			aaColor,
			diffColor,
			diffColorAlt: diffColorAlt ?? diffColor,
			excludeAA: !includeAA,
			diffMask: !!diffMask,
			clear: false,
			oklab: true,
			checkerboard,
			mask: ignoreMask,
			window: side,
		},
		hit,
	);
	return side > 0 ? hit.count : count;
}

export default pixelmatch;
