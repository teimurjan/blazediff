import { brightnessDelta } from "./color-delta";
import type { Image } from "./types";

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
      const delta = brightnessDelta(
        image,
        image,
        centerPixelOffset,
        (y * width + x) * 4,
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
