/**
 * MS-SSIM (Multi-Scale Structural Similarity Index)
 *
 * Reference:
 * Z. Wang, E. P. Simoncelli and A. C. Bovik, "Multi-scale structural similarity
 * for image quality assessment," Invited Paper, IEEE Asilomar Conference on
 * Signals, Systems and Computers, Nov. 2003
 *
 * This implementation matches the original MATLAB implementation exactly.
 */

import rgbaToGrayscale from "./rgba-to-grayscale";
import type { SsimOptions } from "./types";

/**
 * MS-SSIM options extending base SSIM options
 */
export interface MsssimOptions extends SsimOptions {
	/** Number of scales (default: 5) */
	level?: number;
	/** Weights for each scale (default: [0.0448, 0.2856, 0.3001, 0.2363, 0.1333]) */
	weight?: number[];
	/** Combination method: 'product' or 'wtd_sum' (default: 'product') */
	method?: "product" | "wtd_sum";
}

/**
 * SSIM computation result for a single scale
 */
interface SsimResult {
	/** Mean SSIM (luminance × contrast × structure) */
	mssim: number;
	/** Contrast-structure component only (for MS-SSIM) */
	mcs: number;
	/** SSIM map (per-pixel SSIM values) */
	ssimMap: Float32Array;
}

/**
 * Compute MS-SSIM between two images
 *
 * @param image1 - First image data (RGBA format, 4 bytes per pixel)
 * @param image2 - Second image data (RGBA format, 4 bytes per pixel)
 * @param output - Optional output buffer for SSIM map visualization at finest scale (RGBA format)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param options - MS-SSIM computation options
 * @returns MS-SSIM score (0-1, where 1 is identical)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const score = mssim(img1, img2, undefined, width, height);
 *
 * // With SSIM map output
 * const output = new Uint8ClampedArray(width * height * 4);
 * const score = mssim(img1, img2, output, width, height);
 * // output now contains grayscale SSIM map at the finest scale
 * ```
 */
export default function msssim(
	image1: Uint8ClampedArray | Uint8Array | Buffer,
	image2: Uint8ClampedArray | Uint8Array | Buffer,
	output: Uint8ClampedArray | Uint8Array | Buffer | undefined,
	width: number,
	height: number,
	options: MsssimOptions = {},
): number {
	const {
		windowSize = 11,
		k1 = 0.01,
		k2 = 0.03,
		bitDepth = 8,
		level = 5,
		weight = [0.0448, 0.2856, 0.3001, 0.2363, 0.1333],
		method = "product",
	} = options;

	// Convert RGBA to grayscale
	let gray1 = rgbaToGrayscale(image1, width, height);
	let gray2 = rgbaToGrayscale(image2, width, height);
	let currentWidth = width;
	let currentHeight = height;

	const mssimArray: number[] = [];
	const mcsArray: number[] = [];
	let ssimMapAtFinestScale: Float32Array | undefined;

	// Process each scale
	for (let l = 0; l < level; l++) {
		// Compute SSIM at current scale
		const result = computeSsimAtScale(
			gray1,
			gray2,
			currentWidth,
			currentHeight,
			windowSize,
			k1,
			k2,
			bitDepth,
		);

		mssimArray.push(result.mssim);
		mcsArray.push(result.mcs);

		// Store SSIM map from the finest scale (last level) for visualization
		if (l === level - 1 && output) {
			ssimMapAtFinestScale = result.ssimMap;
		}

		// Don't downsample after the last level
		if (l < level - 1) {
			// Downsample for next iteration
			const downsampled = downsampleImages(
				gray1,
				gray2,
				currentWidth,
				currentHeight,
			);
			gray1 = downsampled.img1;
			gray2 = downsampled.img2;
			currentWidth = downsampled.width;
			currentHeight = downsampled.height;
		}
	}

	// Fill output buffer with SSIM map if provided
	if (output && ssimMapAtFinestScale) {
		fillSsimMap(
			output,
			ssimMapAtFinestScale,
			currentWidth,
			currentHeight,
			width,
			height,
		);
	}

	// Combine scales using specified method
	if (method === "product") {
		// Product method: product of (mcs^weight) for levels 1 to n-1, times (mssim^weight) for level n
		let overallMssim = 1;

		// Multiply contrast-structure components for all levels except the last
		for (let l = 0; l < level - 1; l++) {
			overallMssim *= mcsArray[l] ** weight[l];
		}

		// Multiply by full SSIM at the finest scale
		overallMssim *= mssimArray[level - 1] ** weight[level - 1];

		return overallMssim;
	} else {
		// Weighted sum method
		const normalizedWeight = weight.map(
			(w) => w / weight.reduce((a, b) => a + b, 0),
		);
		let overallMssim = 0;

		// Sum contrast-structure components for all levels except the last
		for (let l = 0; l < level - 1; l++) {
			overallMssim += mcsArray[l] * normalizedWeight[l];
		}

		// Add full SSIM at the finest scale
		overallMssim += mssimArray[level - 1] * normalizedWeight[level - 1];

		return overallMssim;
	}
}

// Cache for Gaussian window (reused across all scales)
const gaussianWindow1DCache = new Map<string, Float32Array>();

/**
 * Compute SSIM at a single scale with separable convolution
 * Returns both MSSIM (full) and MCS (contrast-structure only)
 * Optimized version with memory reuse and separable filtering
 */
function computeSsimAtScale(
	gray1: Float32Array,
	gray2: Float32Array,
	width: number,
	height: number,
	windowSize: number,
	k1: number,
	k2: number,
	bitDepth: number,
): SsimResult {
	const L = 2 ** bitDepth - 1;
	const c1 = (k1 * L) ** 2;
	const c2 = (k2 * L) ** 2;

	// Get cached 1D Gaussian window for separable convolution
	const window1d = getCachedGaussianWindow1D(windowSize, 1.5);

	// Allocate output arrays once
	const mu1 = new Float32Array(width * height);
	const mu2 = new Float32Array(width * height);
	const sigma1Sq = new Float32Array(width * height);
	const sigma2Sq = new Float32Array(width * height);
	const sigma12 = new Float32Array(width * height);

	// Allocate temporary buffers for separable convolution
	const tempBuffer1 = new Float32Array(width * height);
	const tempBuffer2 = new Float32Array(width * height);

	// Compute means using separable convolution
	convolveSeparableSymmetric(
		gray1,
		mu1,
		tempBuffer1,
		width,
		height,
		window1d,
		windowSize,
	);
	convolveSeparableSymmetric(
		gray2,
		mu2,
		tempBuffer1,
		width,
		height,
		window1d,
		windowSize,
	);

	// Compute squared images and products
	const gray1Sq = new Float32Array(width * height);
	const gray2Sq = new Float32Array(width * height);
	const gray1gray2 = new Float32Array(width * height);

	const len = gray1.length;
	for (let i = 0; i < len; i++) {
		const g1 = gray1[i];
		const g2 = gray2[i];
		gray1Sq[i] = g1 * g1;
		gray2Sq[i] = g2 * g2;
		gray1gray2[i] = g1 * g2;
	}

	// Compute variance/covariance terms
	convolveSeparableSymmetric(
		gray1Sq,
		sigma1Sq,
		tempBuffer1,
		width,
		height,
		window1d,
		windowSize,
	);
	convolveSeparableSymmetric(
		gray2Sq,
		sigma2Sq,
		tempBuffer1,
		width,
		height,
		window1d,
		windowSize,
	);
	convolveSeparableSymmetric(
		gray1gray2,
		sigma12,
		tempBuffer2,
		width,
		height,
		window1d,
		windowSize,
	);

	// Compute SSIM map components with mean subtraction
	let mssimSum = 0;
	let mcsSum = 0;
	const ssimMap = new Float32Array(mu1.length);

	for (let i = 0; i < mu1.length; i++) {
		const m1 = mu1[i];
		const m2 = mu2[i];
		const m1Sq = m1 * m1;
		const m2Sq = m2 * m2;
		const m1m2 = m1 * m2;

		// Variance and covariance (subtract mean squares)
		const var1 = sigma1Sq[i] - m1Sq;
		const var2 = sigma2Sq[i] - m2Sq;
		const cov12 = sigma12[i] - m1m2;

		// Luminance component
		const l = (2 * m1m2 + c1) / (m1Sq + m2Sq + c1);

		// Contrast-structure component
		const cs = (2 * cov12 + c2) / (var1 + var2 + c2);

		// SSIM = luminance × contrast-structure
		const ssim = l * cs;

		ssimMap[i] = ssim;
		mssimSum += ssim;
		mcsSum += cs;
	}

	return {
		mssim: mssimSum / mu1.length,
		mcs: mcsSum / mu1.length,
		ssimMap,
	};
}

/**
 * Get or create cached 1D Gaussian window
 */
function getCachedGaussianWindow1D(size: number, sigma: number): Float32Array {
	const cacheKey = `${size}_${sigma}`;
	let cached = gaussianWindow1DCache.get(cacheKey);

	if (!cached) {
		cached = createGaussianWindow1D(size, sigma);
		gaussianWindow1DCache.set(cacheKey, cached);
	}

	return cached;
}

/**
 * Create a 1D Gaussian window for separable convolution
 */
function createGaussianWindow1D(size: number, sigma: number): Float32Array {
	const window = new Float32Array(size);
	const center = (size - 1) / 2;
	const twoSigmaSquared = 2 * sigma * sigma;
	let sum = 0;

	for (let i = 0; i < size; i++) {
		const d = i - center;
		const value = Math.exp(-(d * d) / twoSigmaSquared);
		window[i] = value;
		sum += value;
	}

	// Normalize
	for (let i = 0; i < size; i++) {
		window[i] /= sum;
	}

	return window;
}

/**
 * Separable 2D convolution with symmetric padding (for MS-SSIM)
 * Same output size as input ('same' mode)
 * Optimized for Gaussian filtering
 */
function convolveSeparableSymmetric(
	input: Float32Array,
	output: Float32Array,
	temp: Float32Array,
	width: number,
	height: number,
	kernel1d: Float32Array,
	kernelSize: number,
): void {
	const pad = Math.floor(kernelSize / 2);

	// Step 1: Horizontal convolution with symmetric padding
	for (let y = 0; y < height; y++) {
		const rowStart = y * width;

		for (let x = 0; x < width; x++) {
			let sum = 0;

			for (let k = 0; k < kernelSize; k++) {
				let sx = x + k - pad;

				// Symmetric padding
				if (sx < 0) sx = -sx;
				else if (sx >= width) sx = 2 * width - sx - 2;
				sx = Math.max(0, Math.min(width - 1, sx));

				sum += input[rowStart + sx] * kernel1d[k];
			}

			temp[rowStart + x] = sum;
		}
	}

	// Step 2: Vertical convolution with symmetric padding
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let sum = 0;

			for (let k = 0; k < kernelSize; k++) {
				let sy = y + k - pad;

				// Symmetric padding
				if (sy < 0) sy = -sy;
				else if (sy >= height) sy = 2 * height - sy - 2;
				sy = Math.max(0, Math.min(height - 1, sy));

				sum += temp[sy * width + x] * kernel1d[k];
			}

			output[y * width + x] = sum;
		}
	}
}

/**
 * Downsample images by 2x using a 2x2 averaging filter
 * Matches MATLAB's: imfilter(img, ones(2)/4, 'symmetric', 'same') then subsample by 2
 * Uses separable convolution: ones(2,2)/4 = ones(2,1)/2 * ones(1,2)/2
 */
function downsampleImages(
	img1: Float32Array,
	img2: Float32Array,
	width: number,
	height: number,
): { img1: Float32Array; img2: Float32Array; width: number; height: number } {
	// Create 1D averaging filter for separable convolution: [0.5, 0.5]
	const filter1d = new Float32Array([0.5, 0.5]);

	// Allocate buffers for filtered images
	const filtered1 = new Float32Array(width * height);
	const filtered2 = new Float32Array(width * height);
	const temp1 = new Float32Array(width * height);
	const temp2 = new Float32Array(width * height);

	// Apply separable 2×2 averaging filter to both images
	convolveSeparableSymmetric(
		img1,
		filtered1,
		temp1,
		width,
		height,
		filter1d,
		2,
	);
	convolveSeparableSymmetric(
		img2,
		filtered2,
		temp2,
		width,
		height,
		filter1d,
		2,
	);

	// Subsample by 2 (take every other pixel starting from 0)
	const newWidth = Math.floor(width / 2);
	const newHeight = Math.floor(height / 2);
	const downsampled1 = new Float32Array(newWidth * newHeight);
	const downsampled2 = new Float32Array(newWidth * newHeight);

	for (let y = 0; y < newHeight; y++) {
		for (let x = 0; x < newWidth; x++) {
			const srcIdx = y * 2 * width + x * 2;
			const dstIdx = y * newWidth + x;
			downsampled1[dstIdx] = filtered1[srcIdx];
			downsampled2[dstIdx] = filtered2[srcIdx];
		}
	}

	return {
		img1: downsampled1,
		img2: downsampled2,
		width: newWidth,
		height: newHeight,
	};
}

/**
 * Fill output buffer with SSIM map as grayscale image
 * Maps SSIM values (0-1) to grayscale (0-255)
 *
 * The SSIM map is at a different resolution than the original image due to convolution,
 * so we need to upscale it back to the original dimensions.
 *
 * @param output - Output buffer (RGBA format)
 * @param ssimMap - SSIM values from the finest scale
 * @param mapWidth - Width of SSIM map (after convolution)
 * @param mapHeight - Height of SSIM map (after convolution)
 * @param imageWidth - Original image width
 * @param imageHeight - Original image height
 */
function fillSsimMap(
	output: Uint8ClampedArray | Uint8Array,
	ssimMap: Float32Array,
	mapWidth: number,
	mapHeight: number,
	imageWidth: number,
	imageHeight: number,
): void {
	// The SSIM map is smaller than the original image because of convolution
	// We need to map each SSIM value to the corresponding region in the output

	// Calculate scaling factors
	const scaleX = imageWidth / mapWidth;
	const scaleY = imageHeight / mapHeight;

	for (let y = 0; y < imageHeight; y++) {
		for (let x = 0; x < imageWidth; x++) {
			// Map output pixel to SSIM map coordinate
			const mapX = Math.min(Math.floor(x / scaleX), mapWidth - 1);
			const mapY = Math.min(Math.floor(y / scaleY), mapHeight - 1);

			const ssimValue = ssimMap[mapY * mapWidth + mapX];

			// Map SSIM (0-1) to grayscale (0-255)
			// Clamp to valid range in case of numerical issues
			const gray = Math.floor(Math.max(0, Math.min(1, ssimValue)) * 255);

			const idx = (y * imageWidth + x) * 4;
			output[idx] = gray; // R
			output[idx + 1] = gray; // G
			output[idx + 2] = gray; // B
			output[idx + 3] = 255; // A
		}
	}
}
