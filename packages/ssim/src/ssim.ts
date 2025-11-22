/**
 * SSIM (Structural Similarity Index) with automatic downsampling
 *
 * Reference:
 * Z. Wang, A. C. Bovik, H. R. Sheikh, and E. P. Simoncelli,
 * "Image quality assessment: From error visibility to structural similarity,"
 * IEEE Transactions on Image Processing, vol. 13, no. 4, pp. 600-612, Apr. 2004.
 *
 * This implementation matches the MATLAB ssim.m reference implementation.
 */

import rgbaToGrayscale from "./rgba-to-grayscale";
import type { SsimOptions } from "./types";

/**
 * SSIM options
 */
export interface SsimOptionsExtended extends SsimOptions {
  /** Dynamic range of the images (default: 255) */
  L?: number;
}

/**
 * Compute SSIM between two images with automatic downsampling
 *
 * @param image1 - First image data (RGBA format, 4 bytes per pixel)
 * @param image2 - Second image data (RGBA format, 4 bytes per pixel)
 * @param output - Optional output buffer for SSIM map visualization (RGBA format)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param options - SSIM computation options
 * @returns SSIM score (0-1, where 1 is identical)
 *
 * @example
 * ```typescript
 * // Basic usage
 * const score = ssim(img1, img2, undefined, width, height);
 *
 * // With SSIM map output
 * const output = new Uint8ClampedArray(width * height * 4);
 * const score = ssim(img1, img2, output, width, height);
 * ```
 */
export function ssim(
  image1: Uint8ClampedArray | Uint8Array | Buffer,
  image2: Uint8ClampedArray | Uint8Array | Buffer,
  output: Uint8ClampedArray | Uint8Array | Buffer | undefined,
  width: number,
  height: number,
  options: SsimOptionsExtended = {}
): number {
  const { windowSize = 11, k1 = 0.01, k2 = 0.03, L = 255 } = options;

  // Convert RGBA to grayscale
  let gray1 = rgbaToGrayscale(image1, width, height);
  let gray2 = rgbaToGrayscale(image2, width, height);
  let currentWidth = width;
  let currentHeight = height;

  // Automatic downsampling - downsample if image is larger than 256 on any dimension
  const f = Math.max(1, Math.round(Math.min(width, height) / 256));

  if (f > 1) {
    // Downsample using averaging filter
    const downsampled = downsampleImages(
      gray1,
      gray2,
      currentWidth,
      currentHeight,
      f
    );
    gray1 = downsampled.img1;
    gray2 = downsampled.img2;
    currentWidth = downsampled.width;
    currentHeight = downsampled.height;
  }

  // Create Gaussian window (1D vector for separable convolution)
  const sigma = 1.5;
  const window1d = createGaussianWindow1D(windowSize, sigma);

  // Compute SSIM
  const c1 = (k1 * L) ** 2;
  const c2 = (k2 * L) ** 2;

  // Output dimensions after valid convolution
  const outWidth = currentWidth - windowSize + 1;
  const outHeight = currentHeight - windowSize + 1;
  const outLen = outWidth * outHeight;

  // Allocate all output buffers upfront for better memory locality
  const mu1 = new Float32Array(outLen);
  const mu2 = new Float32Array(outLen);
  const sigma1Sq = new Float32Array(outLen);
  const sigma2Sq = new Float32Array(outLen);
  const sigma12 = new Float32Array(outLen);

  // Temporary buffers for separable convolution (reused across all convolutions)
  const tempBuffer = new Float32Array(currentWidth * currentHeight);

  // Compute local statistics using separable convolution
  convolveSeparable(
    gray1,
    mu1,
    tempBuffer,
    currentWidth,
    currentHeight,
    window1d,
    windowSize
  );
  convolveSeparable(
    gray2,
    mu2,
    tempBuffer,
    currentWidth,
    currentHeight,
    window1d,
    windowSize
  );

  // Compute squared images and products IN-PLACE (reuse gray1, gray2 buffers)
  const len = gray1.length;
  for (let i = 0; i < len; i++) {
    const g1 = gray1[i];
    const g2 = gray2[i];
    tempBuffer[i] = g1 * g2; // Store g1*g2 in temp
    gray1[i] = g1 * g1; // Reuse gray1 for gray1Sq
    gray2[i] = g2 * g2; // Reuse gray2 for gray2Sq
  }

  // Compute variance and covariance terms (reusing tempBuffer for intermediate results)
  const tempConv = new Float32Array(currentWidth * currentHeight);
  convolveSeparable(
    gray1,
    sigma1Sq,
    tempConv,
    currentWidth,
    currentHeight,
    window1d,
    windowSize
  );
  convolveSeparable(
    gray2,
    sigma2Sq,
    tempConv,
    currentWidth,
    currentHeight,
    window1d,
    windowSize
  );
  convolveSeparable(
    tempBuffer,
    sigma12,
    tempConv,
    currentWidth,
    currentHeight,
    window1d,
    windowSize
  );

  // Compute SSIM map - combine all operations in one loop
  const ssimMap = new Float32Array(mu1.length);

  for (let i = 0; i < mu1.length; i++) {
    const m1 = mu1[i];
    const m2 = mu2[i];
    const m1Sq = m1 * m1;
    const m2Sq = m2 * m2;
    const m1m2 = m1 * m2;

    // Variance and covariance
    const var1 = sigma1Sq[i] - m1Sq;
    const var2 = sigma2Sq[i] - m2Sq;
    const cov12 = sigma12[i] - m1m2;

    // SSIM formula
    const numerator = (2 * m1m2 + c1) * (2 * cov12 + c2);
    const denominator = (m1Sq + m2Sq + c1) * (var1 + var2 + c2);
    ssimMap[i] = numerator / denominator;
  }

  // Fill output buffer with SSIM map if provided
  if (output) {
    const mapWidth = currentWidth - windowSize + 1;
    const mapHeight = currentHeight - windowSize + 1;
    fillSsimMap(output, ssimMap, mapWidth, mapHeight, width, height);
  }

  // Compute mean SSIM
  let sum = 0;
  for (let i = 0; i < ssimMap.length; i++) {
    sum += ssimMap[i];
  }

  return sum / ssimMap.length;
}

// Cache Gaussian windows to avoid recalculating
const gaussianWindow1DCache = new Map<string, Float32Array>();

/**
 * Create a 1D Gaussian window for separable convolution
 * Since Gaussian is separable: G(x,y) = G(x) * G(y)
 */
function createGaussianWindow1D(size: number, sigma: number): Float32Array {
  const cacheKey = `${size}_${sigma}`;
  const cached = gaussianWindow1DCache.get(cacheKey);
  if (cached) return cached;

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

  gaussianWindow1DCache.set(cacheKey, window);
  return window;
}

/**
 * Separable 2D convolution with 'valid' mode
 * Performs: output = conv2(conv2(input, kernel_horizontal), kernel_vertical)
 * This is ~2x faster than direct 2D convolution for square kernels
 *
 * @param input - Input image
 * @param output - Pre-allocated output buffer (valid size)
 * @param temp - Pre-allocated temporary buffer (same size as input)
 * @param width - Image width
 * @param height - Image height
 * @param kernel1d - 1D Gaussian kernel
 * @param kernelSize - Kernel size
 */
function convolveSeparable(
  input: Float32Array,
  output: Float32Array,
  temp: Float32Array,
  width: number,
  height: number,
  kernel1d: Float32Array,
  kernelSize: number
): void {
  const pad = Math.floor(kernelSize / 2);

  // Step 1: Horizontal convolution (input -> temp)
  // Process interior pixels (fast path - no bounds checking)
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;

    // Left border (with bounds checking)
    for (let x = 0; x < pad; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        const xSrc = x + k - pad;
        const xClamped = Math.max(0, Math.min(width - 1, xSrc));
        sum += input[rowStart + xClamped] * kernel1d[k];
      }
      temp[rowStart + x] = sum;
    }

    // Interior (fast - no bounds checking)
    for (let x = pad; x < width - pad; x++) {
      let sum = 0;
      const srcStart = rowStart + x - pad;
      for (let k = 0; k < kernelSize; k++) {
        sum += input[srcStart + k] * kernel1d[k];
      }
      temp[rowStart + x] = sum;
    }

    // Right border (with bounds checking)
    for (let x = width - pad; x < width; x++) {
      let sum = 0;
      for (let k = 0; k < kernelSize; k++) {
        const xSrc = x + k - pad;
        const xClamped = Math.max(0, Math.min(width - 1, xSrc));
        sum += input[rowStart + xClamped] * kernel1d[k];
      }
      temp[rowStart + x] = sum;
    }
  }

  // Step 2: Vertical convolution with 'valid' output (temp -> output)
  const outWidth = width - kernelSize + 1;
  const outHeight = height - kernelSize + 1;

  let outIdx = 0;
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      let sum = 0;
      const srcX = x + pad;

      for (let k = 0; k < kernelSize; k++) {
        const srcY = y + k;
        sum += temp[srcY * width + srcX] * kernel1d[k];
      }

      output[outIdx++] = sum;
    }
  }
}

/**
 * Downsample images by factor f using separable averaging filter
 * Optimized version using 1D convolutions: faster and uses less memory
 * Matches MATLAB's: imfilter(img, ones(f,f)/f^2, 'symmetric', 'same') then subsample
 */
function downsampleImages(
  img1: Float32Array,
  img2: Float32Array,
  width: number,
  height: number,
  f: number
): { img1: Float32Array; img2: Float32Array; width: number; height: number } {
  // Create 1D averaging filter (separable: ones(f,f)/f^2 = ones(f,1)/f * ones(1,f)/f)
  const filter1d = new Float32Array(f);
  const filterValue = 1 / f;
  for (let i = 0; i < f; i++) {
    filter1d[i] = filterValue;
  }

  // Shared temporary buffer for separable convolution (reused for both images)
  const temp = new Float32Array(width * height);

  // Apply separable filter to img1
  const filtered1 = new Float32Array(width * height);
  convolveSeparableSymmetric(img1, filtered1, temp, width, height, filter1d, f);

  // Reuse temp buffer for img2 filtering
  const filtered2 = new Float32Array(width * height);
  convolveSeparableSymmetric(img2, filtered2, temp, width, height, filter1d, f);

  // Subsample by f
  const newWidth = Math.floor(width / f);
  const newHeight = Math.floor(height / f);
  const downsampled1 = new Float32Array(newWidth * newHeight);
  const downsampled2 = new Float32Array(newWidth * newHeight);

  for (let y = 0; y < newHeight; y++) {
    const srcRowStart = y * f * width;
    const dstRowStart = y * newWidth;
    for (let x = 0; x < newWidth; x++) {
      downsampled1[dstRowStart + x] = filtered1[srcRowStart + x * f];
      downsampled2[dstRowStart + x] = filtered2[srcRowStart + x * f];
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
 * Separable 2D convolution with symmetric padding (for downsampling)
 * Same output size as input ('same' mode)
 */
function convolveSeparableSymmetric(
  input: Float32Array,
  output: Float32Array,
  temp: Float32Array,
  width: number,
  height: number,
  kernel1d: Float32Array,
  kernelSize: number
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
 * Fill output buffer with SSIM map as grayscale image
 */
function fillSsimMap(
  output: Uint8ClampedArray | Uint8Array,
  ssimMap: Float32Array,
  mapWidth: number,
  mapHeight: number,
  imageWidth: number,
  imageHeight: number
): void {
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
      const gray = Math.floor(Math.max(0, Math.min(1, ssimValue)) * 255);

      const idx = (y * imageWidth + x) * 4;
      output[idx] = gray; // R
      output[idx + 1] = gray; // G
      output[idx + 2] = gray; // B
      output[idx + 3] = 255; // A
    }
  }
}

export default ssim;
