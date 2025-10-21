/**
 * SSIM computation options
 */
export interface SsimOptions {
	/**
	 * Window size for SSIM computation (default: 11)
	 */
	windowSize?: number;

	/**
	 * First stability constant (default: 0.01)
	 * Used in luminance comparison: c1 = (k1 * L)^2
	 */
	k1?: number;

	/**
	 * Second stability constant (default: 0.03)
	 * Used in contrast/structure comparison: c2 = (k2 * L)^2
	 */
	k2?: number;

	/**
	 * Bit depth of images (default: 8 for 0-255 range)
	 * L = 2^bitDepth - 1
	 */
	bitDepth?: number;
}

/**
 * Matrix representation for SSIM computation
 * Uses Float32Array for better performance and memory efficiency
 */
export interface Matrix {
	/**
	 * Flat typed array of matrix values
	 * Float32Array provides better cache locality and SIMD optimization
	 */
	data: Float32Array;

	/**
	 * Matrix width
	 */
	width: number;

	/**
	 * Matrix height
	 */
	height: number;
}

/**
 * SSIM computation result
 */
export interface SsimResult {
	/**
	 * Mean SSIM score (0-1, where 1 is identical)
	 */
	mssim: number;

	/**
	 * SSIM map showing local similarity values
	 */
	ssimMap: Matrix;
}
