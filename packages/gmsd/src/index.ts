import {
	computeGradientMagnitudesSquared,
	computeSimilarity,
	computeStdDev,
	rgbaToLuma,
} from "./math";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

/**
 * GMSD (Gradient Magnitude Similarity Deviation) options
 */
export interface GmsdOptions {
	/**
	 * Downsample factor:
	 * - 0: full resolution (no downsampling)
	 * - 1: 2x downsample using box filter
	 * @default 0
	 */
	downsample?: 0 | 1;

	/**
	 * Stability constant to prevent division by zero.
	 * Tuned for 8-bit images (0-255 range).
	 * @default 170 (from original GMSD MATLAB implementation)
	 */
	c?: number;
}

/**
 * Fast GMSD metric for CI visual testing.
 * Returns a similarity score [0..1] where 1 = identical.
 *
 * Uses Sobel gradients on luma channel to compute gradient magnitude similarity,
 * then returns 1 - stddev(similarity) as the final score.
 *
 * @param image1 - First image data (RGBA or grayscale)
 * @param image2 - Second image data (RGBA or grayscale)
 * @param output - Optional RGBA output buffer for GMS map visualization (width * height * 4 bytes)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param opts - GMSD options
 * @returns Similarity score [0..1] where 1 means identical
 */
export function gmsd(
	image1: Image["data"],
	image2: Image["data"],
	output: Image["data"] | undefined,
	width: number,
	height: number,
	opts: GmsdOptions = {},
): number {
	const { downsample = 0, c = 140 } = opts;

	// Fast path: if buffers are identical, fill output with white if provided and return 1
	if (buffersEqual(image1, image2)) {
		if (output) {
			// Fill with white (GMS = 1.0 everywhere for identical images)
			for (let i = 0; i < width * height * 4; i += 4) {
				output[i] = 255; // R
				output[i + 1] = 255; // G
				output[i + 2] = 255; // B
				output[i + 3] = 255; // A
			}
		}
		return 1;
	}

	// Determine if images are RGBA (4 channels) or grayscale (1 channel)
	const bytesPerPixel = image1.length / (width * height);
	const isRGBA = bytesPerPixel === 4;

	// Convert to luma if RGBA, otherwise use as-is
	let luma1: Uint8Array;
	let luma2: Uint8Array;
	let processWidth = width;
	let processHeight = height;

	if (isRGBA) {
		luma1 = new Uint8Array(width * height);
		luma2 = new Uint8Array(width * height);
		rgbaToLuma(image1, luma1, width, height);
		rgbaToLuma(image2, luma2, width, height);
	} else {
		luma1 = new Uint8Array(image1.buffer || image1);
		luma2 = new Uint8Array(image2.buffer || image2);
	}

	// Apply 2x box downsampling if requested
	if (downsample === 1) {
		// Trim odd dimensions
		const dsWidth = Math.floor(width / 2);
		const dsHeight = Math.floor(height / 2);
		const downsampled1 = new Uint8Array(dsWidth * dsHeight);
		const downsampled2 = new Uint8Array(dsWidth * dsHeight);

		boxDownsample2x(luma1, downsampled1, width, height);
		boxDownsample2x(luma2, downsampled2, width, height);

		luma1 = downsampled1;
		luma2 = downsampled2;
		processWidth = dsWidth;
		processHeight = dsHeight;
	}

	// Compute gradient magnitudes squared for both images
	const grad1 = computeGradientMagnitudesSquared(
		luma1,
		processWidth,
		processHeight,
	);
	const grad2 = computeGradientMagnitudesSquared(
		luma2,
		processWidth,
		processHeight,
	);

	// Compute per-pixel similarity and its standard deviation
	const similarity = computeSimilarity(
		grad1,
		grad2,
		c,
		processWidth,
		processHeight,
	);
	const stdDev = computeStdDev(similarity);

	// If output buffer is provided, fill it with GMS map visualization
	if (output) {
		fillGmsMap(output, grad1, grad2, c, processWidth, processHeight);
	}

	// GMSD score: 1 - stddev, clamped to [0, 1]
	const score = 1 - stdDev;
	return Math.max(0, Math.min(1, score));
}

/**
 * Fast buffer equality check
 */
function buffersEqual(
	a: Image["data"],
	b: Image["data"],
): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}

	return true;
}

/**
 * 2x box downsample: average 2x2 blocks
 * Input dimensions must be even (or trim to even)
 */
function boxDownsample2x(
	src: Uint8Array,
	dst: Uint8Array,
	srcWidth: number,
	srcHeight: number,
): void {
	const dstWidth = Math.floor(srcWidth / 2);
	const dstHeight = Math.floor(srcHeight / 2);

	for (let y = 0; y < dstHeight; y++) {
		for (let x = 0; x < dstWidth; x++) {
			const sx = x * 2;
			const sy = y * 2;

			const idx00 = sy * srcWidth + sx;
			const idx01 = sy * srcWidth + sx + 1;
			const idx10 = (sy + 1) * srcWidth + sx;
			const idx11 = (sy + 1) * srcWidth + sx + 1;

			const avg = (src[idx00] + src[idx01] + src[idx10] + src[idx11] + 2) >> 2;
			dst[y * dstWidth + x] = avg;
		}
	}
}

/**
 * Fill output buffer with GMS (Gradient Magnitude Similarity) map visualization.
 * GMS values [0..1] are mapped to grayscale [0..255] where:
 * - 0 (black) = completely different gradients
 * - 1 (white) = identical gradients
 * Border pixels (1px) are set to black since they have no gradient computation.
 */
function fillGmsMap(
	output: Image["data"],
	grad1: Uint32Array,
	grad2: Uint32Array,
	c: number,
	width: number,
	height: number,
): void {
	// Fill entire output with black (border pixels)
	output.fill(0);

	// Process interior pixels (1px border excluded)
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			const ga2 = grad1[i];
			const gb2 = grad2[i];

			// GMS formula: (2 * sqrt(ga2 * gb2) + C) / (ga2 + gb2 + C)
			const numerator = 2 * Math.sqrt(ga2) * Math.sqrt(gb2) + c;
			const denominator = ga2 + gb2 + c;
			const gms = numerator / denominator;

			// Map GMS [0..1] to grayscale [0..255]
			const gray = Math.floor(gms * 255);

			// Write RGBA: grayscale with full opacity
			const idx = i * 4;
			output[idx] = gray; // R
			output[idx + 1] = gray; // G
			output[idx + 2] = gray; // B
			output[idx + 3] = 255; // A
		}
	}
}
