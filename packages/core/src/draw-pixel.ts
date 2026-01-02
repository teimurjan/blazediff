import type { Image } from "./types";

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
 * Draw a grayscale pixel to the output buffer
 */
export function drawGrayPixel(
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
