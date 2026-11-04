/** RGBA8 pixels, `width * height * 4` bytes. Same shape as `@blazediff/core`'s `Image`. */
export interface Image {
	data: Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Size {
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
	 * - 1: 2x downsample using conv2 + subsampling (MATLAB-compatible)
	 * @default 0
	 */
	downsample?: 0 | 1;

	/**
	 * Stability constant to prevent division by zero.
	 * Tuned for 8-bit images (0-255 range).
	 * @default 170 (from original GMSD MATLAB implementation)
	 */
	c?: number;

	/** Draw the gradient similarity map here as grayscale, white where gradients match. */
	output?: Image;
}

export type GmsdResult =
	| {
			kind: "compared";
			/** Deviation of gradient similarity: 0 when identical, higher is more different. */
			score: number;
	  }
	| { kind: "dimension-mismatch"; a: Size; b: Size };

/**
 * GMSD (Gradient Magnitude Similarity Deviation) perceptual image quality metric.
 * Returns the standard deviation of gradient magnitude similarity.
 *
 * LOWER values = better quality (0 = perfect match, higher = more differences).
 *
 * Uses Prewitt gradients on luma channel to compute gradient magnitude similarity,
 * then returns the standard deviation of the similarity map.
 *
 * @param a - First image (RGBA, 4 bytes per pixel)
 * @param b - Second image, the same size as `a`
 * @param options - Downsampling, stability constant and an optional map `output`
 * @returns The score (typically 0-0.35), or `dimension-mismatch`
 *
 * @example
 * ```ts
 * const result = gmsd(a, b, { downsample: 1 });
 * if (result.kind === "compared") console.log(result.score);
 * ```
 */
export function gmsd(
	a: Image,
	b: Image,
	options: GmsdOptions = {},
): GmsdResult {
	assertImage(a, "a");
	assertImage(b, "b");
	if (a.width !== b.width || a.height !== b.height)
		return {
			kind: "dimension-mismatch",
			a: { width: a.width, height: a.height },
			b: { width: b.width, height: b.height },
		};
	if (options.output) {
		assertImage(options.output, "output");
		if (options.output.width !== a.width || options.output.height !== a.height)
			throw new RangeError(
				`output is ${options.output.width}x${options.output.height}, expected ${a.width}x${a.height}.`,
			);
	}
	return { kind: "compared", score: gmsdScore(a, b, options) };
}

function assertImage(image: Image, name: string): void {
	const { data, width, height } = image ?? {};
	if (!ArrayBuffer.isView(data) || (data as Uint8Array).BYTES_PER_ELEMENT !== 1)
		throw new TypeError(
			`${name}.data must be a Uint8Array, Uint8ClampedArray or Buffer.`,
		);
	if (
		!Number.isInteger(width) ||
		!Number.isInteger(height) ||
		width < 1 ||
		height < 1
	)
		throw new RangeError(`${name} has an invalid size: ${width}x${height}.`);
	if (data.length !== width * height * 4)
		throw new RangeError(
			`${name}.data is ${data.length} bytes, expected ${width * height * 4} for ${width}x${height}.`,
		);
}

function gmsdScore(a: Image, b: Image, options: GmsdOptions): number {
	const { downsample = 0, c = 170 } = options;
	const { width, height } = a;
	const output = options.output?.data;

	// Fast path: identical buffers have GMSD 0 and an all-white GMS map.
	if (buffersEqual(a.data, b.data)) {
		output?.fill(255);
		return 0;
	}

	let luma1 = new Float32Array(width * height);
	let luma2 = new Float32Array(width * height);
	let processWidth = width;
	let processHeight = height;
	rgbaToLuma(a.data, luma1, width, height);
	rgbaToLuma(b.data, luma2, width, height);

	// Apply 2x downsampling if requested (MATLAB-compatible: conv2 + subsample)
	if (downsample === 1) {
		const filtered1 = conv2Same(luma1, width, height);
		const filtered2 = conv2Same(luma2, width, height);

		const dsWidth = Math.floor(width / 2);
		const dsHeight = Math.floor(height / 2);
		const downsampled1 = new Float32Array(dsWidth * dsHeight);
		const downsampled2 = new Float32Array(dsWidth * dsHeight);

		// Subsample: take every 2nd pixel starting from (0,0)
		for (let y = 0; y < dsHeight; y++) {
			for (let x = 0; x < dsWidth; x++) {
				const srcIdx = y * 2 * width + x * 2;
				downsampled1[y * dsWidth + x] = filtered1[srcIdx];
				downsampled2[y * dsWidth + x] = filtered2[srcIdx];
			}
		}

		luma1 = downsampled1;
		luma2 = downsampled2;
		processWidth = dsWidth;
		processHeight = dsHeight;
	}

	// Compute gradient magnitudes using Prewitt operator
	const grad1 = computeGradientMagnitudes(luma1, processWidth, processHeight);
	const grad2 = computeGradientMagnitudes(luma2, processWidth, processHeight);

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

	return stdDev;
}

/**
 * Fast buffer equality check
 */
function buffersEqual(a: Image["data"], b: Image["data"]): boolean {
	if (a.length !== b.length) return false;

	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}

	return true;
}

/**
 * Apply 2x2 averaging filter using conv2 with 'same' mode (MATLAB-compatible)
 * Kernel: [0.25 0.25; 0.25 0.25]
 */
function conv2Same(
	src: Float32Array,
	width: number,
	height: number,
): Float32Array {
	const result = new Float32Array(width * height);

	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;

			// Apply 2x2 kernel, handling borders
			for (let ky = 0; ky < 2; ky++) {
				for (let kx = 0; kx < 2; kx++) {
					const ny = y + ky;
					const nx = x + kx;

					// Zero-padding at borders (MATLAB 'same' mode default)
					if (ny < height && nx < width) {
						sum += src[ny * width + nx];
					}
				}
			}

			result[y * width + x] = sum / 4; // Average (divide by kernel size, not count)
		}
	}

	return result;
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
	grad1: Float32Array,
	grad2: Float32Array,
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
			const mag1 = grad1[i];
			const mag2 = grad2[i];

			// GMS formula: (2 * mag1 * mag2 + C) / (mag1^2 + mag2^2 + C)
			const numerator = 2 * mag1 * mag2 + c;
			const denominator = mag1 * mag1 + mag2 * mag2 + c;
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

/**
 * Convert RGBA to luma using BT.601 coefficients (MATLAB-compatible)
 * Y = 0.298936R + 0.587043G + 0.114021B
 */
export function rgbaToLuma(
	rgba: Image["data"],
	luma: Float32Array,
	width: number,
	height: number,
): void {
	const len = width * height;
	for (let i = 0; i < len; i++) {
		const idx = i * 4;
		const r = rgba[idx];
		const g = rgba[idx + 1];
		const b = rgba[idx + 2];
		// BT.601 coefficients (MATLAB rgb2gray)
		luma[i] = 0.298936 * r + 0.587043 * g + 0.114021 * b;
	}
}

/**
 * Compute gradient magnitudes using Prewitt operator (3x3)
 * Returns magnitude = sqrt(Gx^2 + Gy^2) for each pixel
 *
 * Note: Original GMSD paper uses Prewitt operator divided by 3:
 * dx = [1 0 -1; 1 0 -1; 1 0 -1]/3
 * dy = dx'
 */
export function computeGradientMagnitudes(
	luma: Float32Array,
	width: number,
	height: number,
): Float32Array {
	const grad = new Float32Array(width * height);

	// Process interior pixels (1px border excluded)
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const idx = y * width + x;

			// Fetch 3x3 neighborhood
			const tl = luma[(y - 1) * width + (x - 1)];
			const tc = luma[(y - 1) * width + x];
			const tr = luma[(y - 1) * width + (x + 1)];
			const ml = luma[y * width + (x - 1)];
			const mr = luma[y * width + (x + 1)];
			const bl = luma[(y + 1) * width + (x - 1)];
			const bc = luma[(y + 1) * width + x];
			const br = luma[(y + 1) * width + (x + 1)];

			// Prewitt Gx = [1 0 -1; 1 0 -1; 1 0 -1]/3
			const gx = (tl + ml + bl - tr - mr - br) / 3;

			// Prewitt Gy = [1 1 1; 0 0 0; -1 -1 -1]/3
			const gy = (tl + tc + tr - bl - bc - br) / 3;

			// Store magnitude (not magnitude squared)
			grad[idx] = Math.sqrt(gx * gx + gy * gy);
		}
	}

	return grad;
}

/**
 * Compute per-pixel gradient magnitude similarity (GMS)
 * Formula: GMS = (2 * mag1 * mag2 + C) / (mag1^2 + mag2^2 + C)
 */
export function computeSimilarity(
	grad1: Float32Array,
	grad2: Float32Array,
	c: number,
	width: number,
	height: number,
): Float32Array {
	const validPixels: number[] = [];

	// Only process interior pixels (1px border excluded)
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			const mag1 = grad1[i];
			const mag2 = grad2[i];

			// GMS formula: (2 * mag1 * mag2 + C) / (mag1^2 + mag2^2 + C)
			const numerator = 2 * mag1 * mag2 + c;
			const denominator = mag1 * mag1 + mag2 * mag2 + c;

			validPixels.push(numerator / denominator);
		}
	}

	return new Float32Array(validPixels);
}

/**
 * Compute standard deviation of similarity values
 */
export function computeStdDev(values: Float32Array): number {
	const len = values.length;
	if (len === 0) return 0;

	// Compute mean
	let sum = 0;
	for (let i = 0; i < len; i++) {
		sum += values[i];
	}
	const mean = sum / len;

	// Compute variance
	let variance = 0;
	for (let i = 0; i < len; i++) {
		const diff = values[i] - mean;
		variance += diff * diff;
	}
	variance /= len;

	return Math.sqrt(variance);
}

export default gmsd;
