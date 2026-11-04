import {
	type PixelData,
	SHIFT_A,
	SHIFT_B,
	SHIFT_G,
	SHIFT_R,
	YIQ_Y_B,
	YIQ_Y_G,
	YIQ_Y_R,
} from "./pixel";

/**
 * Calculate brightness difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function brightnessDelta(
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

	// same as in colorDelta
	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// Same checkerboard blend as colorDelta.
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
 *
 * @param a32 - Uint32 view of `image` itself, **not** of the other image. The
 *              neighbour scan reads brightness through this view, so passing a
 *              view of a different buffer yields wrong results. Call sites pair
 *              them as `(image1, …, a32, b32)` and `(image2, …, b32, a32)`.
 * @param b32 - Uint32 view of the *opposite* image; used only by the
 *              `hasManySiblings` cross-check.
 * @param overWhite - Composite semi-transparent pixels over white with an
 *              alpha tie-break (pixelmatch 8) instead of the checkerboard.
 */
export function antialiased(
	image: PixelData,
	x1: number,
	y1: number,
	width: number,
	height: number,
	a32: Uint32Array,
	b32: Uint32Array,
	overWhite = false,
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

	// Center pixel hoisted out of the neighbour loop. brightnessDelta used to
	// re-read all four of its bytes on each of the 8 iterations.
	const centerWord = a32[pos];
	const centerR = (centerWord >>> SHIFT_R) & 0xff;
	const centerG = (centerWord >>> SHIFT_G) & 0xff;
	const centerB = (centerWord >>> SHIFT_B) & 0xff;
	const centerA = (centerWord >>> SHIFT_A) & 0xff;

	// Go through 8 adjacent pixels
	for (let x = x0; x <= x2; x++) {
		for (let y = y0; y <= y2; y++) {
			if (x === x1 && y === y1) continue;

			// Brightness delta between the center pixel and adjacent one.
			// When both pixels are opaque the deltas come out of the 32-bit
			// words directly: 1 load per neighbour instead of 8. The deltas
			// are still formed on the raw channel values in the same order, so
			// this is bit-identical to brightnessDelta, not an approximation.
			const neighborPos = y * width + x;
			const neighborWord = a32[neighborPos];
			let delta: number;
			if (centerA === 0xff && ((neighborWord >>> SHIFT_A) & 0xff) === 0xff) {
				delta =
					(centerR - ((neighborWord >>> SHIFT_R) & 0xff)) * YIQ_Y_R +
					(centerG - ((neighborWord >>> SHIFT_G) & 0xff)) * YIQ_Y_G +
					(centerB - ((neighborWord >>> SHIFT_B) & 0xff)) * YIQ_Y_B;
			} else if (overWhite) {
				delta = brightnessDeltaOverWhite(
					centerR,
					centerG,
					centerB,
					centerA,
					neighborWord,
				);
			} else {
				delta = brightnessDelta(
					image,
					image,
					centerPixelOffset,
					neighborPos * 4,
				);
			}

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
 * Luma delta with both pixels composited over white. When the composite luma
 * cancels out but alpha differs, half the alpha delta gives the ramp direction.
 */
function brightnessDeltaOverWhite(
	r1: number,
	g1: number,
	b1: number,
	a1: number,
	neighbor: number,
): number {
	const r2 = (neighbor >>> SHIFT_R) & 0xff;
	const g2 = (neighbor >>> SHIFT_G) & 0xff;
	const b2 = (neighbor >>> SHIFT_B) & 0xff;
	const a2 = (neighbor >>> SHIFT_A) & 0xff;
	const da = a1 - a2;
	if (r1 === r2 && g1 === g2 && b1 === b2 && da === 0) return 0;
	const dr = (r1 * a1 - r2 * a2 - 255 * da) / 255;
	const dg = (g1 * a1 - g2 * a2 - 255 * da) / 255;
	const db = (b1 * a1 - b2 * a2 - 255 * da) / 255;
	const delta = dr * YIQ_Y_R + dg * YIQ_Y_G + db * YIQ_Y_B;
	return delta === 0 && da !== 0 ? da / 2 : delta;
}
