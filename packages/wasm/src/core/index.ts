import { areIdentical } from './are-identical';
import { calculateBlockSize } from './calculate-block-size';
import { colorDelta } from './color-delta';
import { drawPixelGray, drawPixelRGB } from './draw-pixel';
import { isAntialiased } from './is-antialiased';

export function blazediff(
  img1: usize,
  img2: usize,
  output: usize,
  width: i32,
  height: i32,
  threshold: f32,
  alpha: f32,
  aaColorR: u8,
  aaColorG: u8,
  aaColorB: u8,
  diffColorR: u8,
  diffColorG: u8,
  diffColorB: u8,
  diffColorAltR: u8,
  diffColorAltG: u8,
  diffColorAltB: u8,
  includeAA: boolean,
  diffMask: boolean,
): i32 {
  if (img1 === 0 || img2 === 0) {
    return -1;
  }

  const dataSize = width * height * 4;

  // Fast SIMD-based identical image check
  if (areIdentical(img1, img2, dataSize)) {
    // Images are identical - fill output with gray if requested
    if (output && !diffMask) {
      for (let i: i32 = 0; i < width * height; i++) {
        drawPixelGray(img1, i << 2, alpha, output);
      }
    }
    return 0;
  }

  const blockSize = calculateBlockSize(width, height);
  const blocksX = (width + blockSize - 1) / blockSize; // ceiling division
  const blocksY = (height + blockSize - 1) / blockSize;

  const maxBlocks = ((width + 7) / 8) * ((height + 7) / 8); // worst case
  const changedBlockCoords = new Int32Array(maxBlocks * 4); // x,y,endX,endY
  let changedBlocksCount: i32 = 0;

  // Phase 1: Find changed blocks using optimized comparison
  for (let by: i32 = 0; by < blocksY; by++) {
    for (let bx: i32 = 0; bx < blocksX; bx++) {
      const startX = bx * blockSize;
      const startY = by * blockSize;
      const endX = startX + blockSize < width ? startX + blockSize : width;
      const endY = startY + blockSize < height ? startY + blockSize : height;

      let blockIdentical = true;

      // Optimized block comparison with SIMD
      for (let y = startY; y < endY && blockIdentical; y++) {
        const rowStart = y * width + startX;
        const rowWidth = endX - startX;
        let x: i32 = 0;

        // Process 8 pixels at once with two SIMD operations
        if (rowWidth >= 8) {
          for (; x <= rowWidth - 8; x += 8) {
            const idx = (rowStart + x) << 2;

            // Compare first 4 pixels
            const vec1a = v128.load(img1 + idx);
            const vec2a = v128.load(img2 + idx);
            const cmp1 = i8x16.eq(vec1a, vec2a);

            // Compare next 4 pixels
            const vec1b = v128.load(img1 + idx + 16);
            const vec2b = v128.load(img2 + idx + 16);
            const cmp2 = i8x16.eq(vec1b, vec2b);

            // Check if all 8 pixels are identical
            if (!v128.all_true<i8>(cmp1) || !v128.all_true<i8>(cmp2)) {
              blockIdentical = false;
              break;
            }
          }
        }

        // Process 4 pixels at once
        if (blockIdentical && rowWidth >= 4) {
          for (; x <= rowWidth - 4; x += 4) {
            const idx = (rowStart + x) << 2;
            const vec1 = v128.load(img1 + idx);
            const vec2 = v128.load(img2 + idx);
            const cmp = i8x16.eq(vec1, vec2);
            if (!v128.all_true<i8>(cmp)) {
              blockIdentical = false;
              break;
            }
          }
        }

        // Handle remaining pixels with SIMD where possible (2 pixels)
        if (blockIdentical && x <= rowWidth - 2) {
          const idx = (rowStart + x) << 2;
          const vec1 = v128.load64_zero(img1 + idx);
          const vec2 = v128.load64_zero(img2 + idx);
          const cmp = i8x16.eq(vec1, vec2);
          if (!v128.all_true<i8>(cmp)) {
            blockIdentical = false;
          } else {
            x += 2;
          }
        }

        // Handle single remaining pixel
        if (blockIdentical && x < rowWidth) {
          const i = rowStart + x;
          const pixel1 = load<u32>(img1 + (i << 2));
          const pixel2 = load<u32>(img2 + (i << 2));
          if (pixel1 !== pixel2) {
            blockIdentical = false;
          }
        }
      }

      // Draw gray pixels for identical blocks if needed
      if (blockIdentical && output && !diffMask) {
        // Process the entire block with SIMD for gray drawing
        for (let y = startY; y < endY; y++) {
          const rowStart = y * width + startX;
          const rowWidth = endX - startX;
          for (let x: i32 = 0; x < rowWidth; x++) {
            const i = rowStart + x;
            drawPixelGray(img1, i << 2, alpha, output);
          }
        }
      }

      if (!blockIdentical) {
        // Store coordinates for changed blocks
        const coordIndex = changedBlocksCount * 4;
        changedBlockCoords[coordIndex] = startX;
        changedBlockCoords[coordIndex + 1] = startY;
        changedBlockCoords[coordIndex + 2] = endX;
        changedBlockCoords[coordIndex + 3] = endY;
        changedBlocksCount++;
      }
    }
  }

  // Early exit if no changed blocks
  if (changedBlocksCount === 0) {
    return 0;
  }

  // Maximum acceptable square distance between two colors
  const maxDelta = 35215.0 * threshold * threshold;
  let diff: i32 = 0;

  // Phase 2: Process only changed blocks
  for (let blockIdx: i32 = 0; blockIdx < changedBlocksCount; blockIdx++) {
    const coordIndex = blockIdx * 4;
    const startX = changedBlockCoords[coordIndex];
    const startY = changedBlockCoords[coordIndex + 1];
    const endX = changedBlockCoords[coordIndex + 2];
    const endY = changedBlockCoords[coordIndex + 3];

    for (let y = startY; y < endY; y++) {
      const yOffset = y * width;
      for (let x = startX; x < endX; x++) {
        const pixelIndex = yOffset + x;
        const pos = pixelIndex << 2;

        const pixel1 = load<u32>(img1 + pos);
        const pixel2 = load<u32>(img2 + pos);

        const delta =
          pixel1 === pixel2 ? 0.0 : colorDelta(img1, img2, pos, pos, false);

        // Color difference is above threshold
        if (NativeMath.abs(delta) > maxDelta) {
          // Check if it's anti-aliasing
          const isExcludedAA =
            !includeAA &&
            (isAntialiased(img1, x, y, img2, width, height) ||
              isAntialiased(img2, x, y, img1, width, height));

          if (isExcludedAA) {
            // One of the pixels is anti-aliasing
            if (output && !diffMask) {
              drawPixelRGB(output, pos, aaColorR, aaColorG, aaColorB);
            }
          } else {
            // Found significant difference not caused by anti-aliasing
            if (output) {
              if (delta < 0.0) {
                drawPixelRGB(
                  output,
                  pos,
                  diffColorAltR,
                  diffColorAltG,
                  diffColorAltB,
                );
              } else {
                drawPixelRGB(output, pos, diffColorR, diffColorG, diffColorB);
              }
            }
            diff++;
          }
        } else if (output && !diffMask) {
          // Pixels are similar
          drawPixelGray(img1, pos, alpha, output);
        }
      }
    }
  }

  return diff;
}

export function allocateBuffer(size: i32): usize {
  return heap.alloc(size);
}

export function freeBuffer(ptr: usize): void {
  heap.free(ptr);
}

export function getMemory(): usize {
  return changetype<usize>(0);
}
