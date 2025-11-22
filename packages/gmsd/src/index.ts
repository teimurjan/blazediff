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
}

/**
 * GMSD (Gradient Magnitude Similarity Deviation) perceptual image quality metric.
 * Returns the standard deviation of gradient magnitude similarity.
 *
 * LOWER values = better quality (0 = perfect match, higher = more differences).
 *
 * Uses Prewitt gradients on luma channel to compute gradient magnitude similarity,
 * then returns the standard deviation of the similarity map.
 *
 * @param image1 - First image data (RGBA or grayscale)
 * @param image2 - Second image data (RGBA or grayscale)
 * @param output - Optional RGBA output buffer for GMS map visualization (width * height * 4 bytes)
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param opts - GMSD options
 * @returns GMSD score where 0 = identical, higher = more different (typically 0-0.35 range)
 */
export function gmsd(
  image1: Image["data"],
  image2: Image["data"],
  output: Image["data"] | undefined,
  width: number,
  height: number,
  opts: GmsdOptions = {}
): number {
  const { downsample = 0, c = 170 } = opts;

  // Fast path: if buffers are identical, fill output with white if provided and return 0
  // (GMSD = 0 means perfect match - no deviation in gradient similarity)
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
    return 0;
  }

  // Determine if images are RGBA (4 channels) or grayscale (1 channel)
  const bytesPerPixel = image1.length / (width * height);
  const isRGBA = bytesPerPixel === 4;

  // Convert to luma if RGBA, otherwise use as-is
  let luma1: Float32Array;
  let luma2: Float32Array;
  let processWidth = width;
  let processHeight = height;

  if (isRGBA) {
    luma1 = new Float32Array(width * height);
    luma2 = new Float32Array(width * height);
    rgbaToLuma(image1, luma1, width, height);
    rgbaToLuma(image2, luma2, width, height);
  } else {
    // Convert Uint8Array to Float32Array for consistency
    luma1 = new Float32Array(width * height);
    luma2 = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      luma1[i] = image1[i];
      luma2[i] = image2[i];
    }
  }

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
    processHeight
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
  height: number
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
  height: number
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
  height: number
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
  height: number
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
  height: number
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
