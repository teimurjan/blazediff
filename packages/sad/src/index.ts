/**
 * High-performance Downsampled-luma SAD (Sum of Absolute Differences)
 * Optimized for speed with tiling, early exit, and optional Gaussian blur
 */

import { BlazeDiffImage } from "@blazediff/types";

interface SADOptions {
  tileSize: number;
  downsampleFactor: number;
  enableBlur: boolean;
  earlyExitThreshold: number;
}

/**
 * Fast luma conversion using integer arithmetic
 * Y = 0.299R + 0.587G + 0.114B ≈ (77R + 150G + 29B) >> 8
 */
function rgbaToLuma(r: number, g: number, b: number): number {
  return (77 * r + 150 * g + 29 * b) >> 8;
}

function downsampleLuma(
  rgba: BlazeDiffImage["data"],
  width: number,
  height: number,
  factor: number
): BlazeDiffImage {
  const newWidth = Math.floor(width / factor);
  const newHeight = Math.floor(height / factor);
  const downsampled = new Uint8Array(newWidth * newHeight);

  for (let y = 0; y < newHeight; y++) {
    for (let x = 0; x < newWidth; x++) {
      const srcX = x * factor;
      const srcY = y * factor;

      // Sample 2x2 block and average
      let lumaSum = 0;
      let samples = 0;

      for (let dy = 0; dy < factor && srcY + dy < height; dy++) {
        for (let dx = 0; dx < factor && srcX + dx < width; dx++) {
          const srcIdx = ((srcY + dy) * width + (srcX + dx)) * 4;
          const luma = rgbaToLuma(
            rgba[srcIdx],
            rgba[srcIdx + 1],
            rgba[srcIdx + 2]
          );
          lumaSum += luma;
          samples++;
        }
      }

      downsampled[y * newWidth + x] = Math.floor(lumaSum / samples);
    }
  }

  return { data: downsampled, width: newWidth, height: newHeight };
}

/**
 * Apply lightweight Gaussian blur (σ≈1) using 3x3 kernel
 * Kernel: [1,2,1; 2,4,2; 1,2,1] / 16
 */
function applyGaussianBlur(
  luma: BlazeDiffImage["data"],
  width: number,
  height: number
): Uint8Array {
  const blurred = new Uint8Array(width * height);

  // Gaussian 3x3 kernel weights (sum = 16)
  const kernel: readonly number[] = [1, 2, 1, 2, 4, 2, 1, 2, 1];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let weightSum = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const ny = y + ky;
          const nx = x + kx;

          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            const weight = kernel[(ky + 1) * 3 + (kx + 1)];
            sum += luma[ny * width + nx] * weight;
            weightSum += weight;
          }
        }
      }

      blurred[y * width + x] = Math.floor(sum / weightSum);
    }
  }

  return blurred;
}

function computeTileSAD(
  lumaA: BlazeDiffImage["data"],
  lumaB: BlazeDiffImage["data"],
  width: number,
  height: number, // Add height parameter
  tileX: number,
  tileY: number,
  tileSize: number,
  threshold: number
): number {
  let sad = 0;
  const maxX = Math.min(tileX + tileSize, width);
  const maxY = Math.min(tileY + tileSize, height); // FIX: Use height, not width!

  for (let y = tileY; y < maxY; y++) {
    for (let x = tileX; x < maxX; x++) {
      const idx = y * width + x;
      sad += Math.abs(lumaA[idx] - lumaB[idx]);

      // Early exit if SAD exceeds threshold
      if (sad > threshold) {
        return -1;
      }
    }
  }

  return sad;
}

function generateDiffImage(
  imgA: BlazeDiffImage["data"],
  imgB: BlazeDiffImage["data"],
  output: BlazeDiffImage["data"],
  width: number,
  height: number
): void {
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;

    // Convert to luma and compute difference
    const lumaA = rgbaToLuma(imgA[idx], imgA[idx + 1], imgA[idx + 2]);
    const lumaB = rgbaToLuma(imgB[idx], imgB[idx + 1], imgB[idx + 2]);
    const diff = Math.abs(lumaA - lumaB);

    if (diff === 0) {
      // No change - show grayscale (average of both images)
      const avgLuma = Math.floor((lumaA + lumaB) / 2);
      output[idx] = avgLuma; // R = grayscale
      output[idx + 1] = avgLuma; // G = grayscale
      output[idx + 2] = avgLuma; // B = grayscale
      output[idx + 3] = 255; // A = opaque (THIS WAS MISSING!)
    } else {
      // Show difference as red intensity on grayscale base
      const baseLuma = Math.floor((lumaA + lumaB) / 2);

      // Option 1: Pure red for differences
      output[idx] = 255; // R (enhanced red)
      output[idx + 1] = baseLuma; // G (keep some grayscale)
      output[idx + 2] = baseLuma; // B (keep some grayscale)
      output[idx + 3] = 255; // A
    }
  }
}

export default function sad(
  imgA: BlazeDiffImage["data"],
  imgB: BlazeDiffImage["data"],
  output: BlazeDiffImage["data"] | null | undefined,
  width: number,
  height: number,
  config?: Partial<SADOptions>
): number {
  // Configuration with defaults
  const {
    tileSize = 64,
    downsampleFactor = 2,
    enableBlur = true,
    earlyExitThreshold = 10000,
  }: SADOptions = { ...config } as SADOptions;

  // Downsample both images to luma
  const dsA = downsampleLuma(imgA, width, height, downsampleFactor);
  const dsB = downsampleLuma(imgB, width, height, downsampleFactor);

  let lumaA = dsA.data;
  let lumaB = dsB.data;

  // Optional Gaussian blur for noise robustness
  if (enableBlur) {
    lumaA = applyGaussianBlur(lumaA, dsA.width, dsA.height);
    lumaB = applyGaussianBlur(lumaB, dsB.width, dsB.height);
  }

  // Compute SAD using tiling with early exit
  let totalSAD = 0;
  let processedPixels = 0;
  let earlyExitTiles = 0;

  for (let tileY = 0; tileY < dsA.height; tileY += tileSize) {
    for (let tileX = 0; tileX < dsA.width; tileX += tileSize) {
      const tileSAD = computeTileSAD(
        lumaA,
        lumaB,
        dsA.width,
        dsA.height,
        tileX,
        tileY,
        tileSize,
        earlyExitThreshold
      );

      if (tileSAD === -1) {
        // Early exit - assume maximum difference for this tile
        const tilePixels =
          Math.min(tileSize, dsA.width - tileX) *
          Math.min(tileSize, dsA.height - tileY);
        totalSAD += 255 * tilePixels; // Max possible SAD for this tile
        earlyExitTiles++;
      } else {
        totalSAD += tileSAD;
      }

      const tilePixels =
        Math.min(tileSize, dsA.width - tileX) *
        Math.min(tileSize, dsA.height - tileY);
      processedPixels += tilePixels;
    }
  }

  // Optional: Generate output difference image
  if (output) {
    generateDiffImage(imgA, imgB, output, width, height);
  }

  // Normalize SAD to 0-1 range
  const maxPossibleSAD = processedPixels * 255;
  const normalizedSAD = totalSAD / maxPossibleSAD;
  const similarity = 1 - (isNaN(normalizedSAD) ? 1 : normalizedSAD);

  return similarity;
}
