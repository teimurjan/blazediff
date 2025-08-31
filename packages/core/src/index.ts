import type { BlazeDiffOptions, BlazeDiffImage } from "@blazediff/types";

export default function blazediff(
  image1: BlazeDiffImage['data'],
  image2: BlazeDiffImage['data'],
  output: BlazeDiffImage['data'] | void,
  width: number,
  height: number,
  options: BlazeDiffOptions = {}
): number {
  const {
    threshold = 0.1,
    alpha = 0.1,
    aaColor = [255, 255, 0],
    diffColor = [255, 0, 0],
    includeAA,
    diffColorAlt,
    diffMask,
  } = options;

  if (
    !isValidImageInput(image1) ||
    !isValidImageInput(image2) ||
    (output && !isValidImageInput(output))
  )
    throw new Error(
      "Image data: Uint8Array, Uint8ClampedArray or Buffer expected."
    );

  if (
    image1.length !== image2.length ||
    (output && output.length !== image1.length)
  )
    throw new Error(
      `Image sizes do not match. Image 1 size: ${image1.length}, image 2 size: ${image2.length}`
    );

  if (image1.length !== width * height * 4)
    throw new Error(
      `Image data size does not match width/height. Expecting ${
        width * height * 4
      }. Got ${image1.length}`
    );

  const len = width * height;
  const a32 = new Uint32Array(image1.buffer, image1.byteOffset, len);
  const b32 = new Uint32Array(image2.buffer, image2.byteOffset, len);
  const blockSize = calculateOptimalBlockSize(width, height);

  const blocksX = Math.ceil(width / blockSize);
  const blocksY = Math.ceil(height / blockSize);

  const maxBlocks = Math.ceil(width / 8) * Math.ceil(height / 8); // worst case
  const changedBlockCoords = new Int32Array(maxBlocks * 4); // x,y,endX,endY

  let changedCount = 0;

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const startX = bx * blockSize;
      const startY = by * blockSize;
      const endX = Math.min(startX + blockSize, width);
      const endY = Math.min(startY + blockSize, height);

      let blockIdentical = true;

      // Check block using 32-bit integer comparison
      outer: for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const i = y * width + x;
          if (a32[i] !== b32[i]) {
            blockIdentical = false;
            break outer;
          }
          if (output && !diffMask) {
            drawGrayPixel(image1, i * 4, alpha, output);
          }
        }
      }

      if (!blockIdentical) {
        // Store coordinates for changed blocks
        const coordIndex = changedCount * 4;
        changedBlockCoords[coordIndex] = startX;
        changedBlockCoords[coordIndex + 1] = startY;
        changedBlockCoords[coordIndex + 2] = endX;
        changedBlockCoords[coordIndex + 3] = endY;
        changedCount++;
      }
    }
  }

  // Early exit if no changed blocks
  if (changedCount === 0) {
    return 0;
  }

  // Maximum acceptable square distance between two colors;
  // 35215 is the maximum possible value for the YIQ difference metric
  const maxDelta = 35215 * threshold * threshold;
  const [aaR, aaG, aaB] = aaColor;
  const [diffR, diffG, diffB] = diffColor;
  const [altR, altG, altB] = diffColorAlt || diffColor;
  let diff = 0;

  // Process only changed blocks
  for (let blockIdx = 0; blockIdx < changedCount; blockIdx++) {
    const coordIndex = blockIdx * 4;
    const startX = changedBlockCoords[coordIndex];
    const startY = changedBlockCoords[coordIndex + 1];
    const endX = changedBlockCoords[coordIndex + 2];
    const endY = changedBlockCoords[coordIndex + 3];

    for (let y = startY; y < endY; y++) {
      for (let x = startX; x < endX; x++) {
        const pixelIndex = y * width + x;
        const pos = pixelIndex * 4;

        const delta =
          a32[pixelIndex] === b32[pixelIndex]
            ? 0
            : luminanceDelta(image1, image2, pos, pos);

        // the color difference is above the threshold
        if (Math.abs(delta) > maxDelta) {
          // check it's a real rendering difference or just anti-aliasing
          const isExcludedAA =
            !includeAA &&
            (antialiased(image1, x, y, width, height, a32, b32) ||
              antialiased(image2, x, y, width, height, b32, a32));
          if (isExcludedAA) {
            // one of the pixels is anti-aliasing; draw as yellow and do not count as difference
            // note that we do not include such pixels in a mask
            if (output && !diffMask) drawPixel(output, pos, aaR, aaG, aaB);
          } else {
            // found substantial difference not caused by anti-aliasing; draw it as such
            if (output) {
              if (delta < 0) {
                drawPixel(output, pos, altR, altG, altB);
              } else {
                drawPixel(output, pos, diffR, diffG, diffB);
              }
            }
            diff++;
          }
        } else if (output && !diffMask) {
          // pixels are similar; draw background as grayscale image blended with white
          drawGrayPixel(image1, pos, alpha, output);
        }
      }
    }
  }

  return diff;
}

function calculateOptimalBlockSize(width: number, height: number): number {
  const area = width * height;

  // Block size grows roughly with the square root of the image area
  // Scale factor chosen to match your thresholds
  const base = 16;
  const scale = Math.sqrt(area) / 100; // 100 is a tuning constant

  // Round to nearest power-of-two block size
  const rawSize = base * Math.pow(scale, 0.5);
  return Math.pow(2, Math.round(Math.log2(rawSize)));
}

/** Check if array is valid pixel data */
function isValidImageInput(arr: unknown): arr is BlazeDiffImage['data'] {
  // work around instanceof Uint8Array not working properly in some Jest environments
  return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}

/**
 * Accurate luminance calculation
 * Uses standard ITU-R BT.709 luma coefficients
 */
function getLuminance(image: BlazeDiffImage['data'], pos: number): number {
  const r = image[pos];
  const g = image[pos + 1];
  const b = image[pos + 2];

  // ITU-R BT.709 luma coefficients (similar to your YIQ but faster)
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}

/**
 * Calculate the luminance delta between two pixels
 */
function luminanceDelta(
  image1: BlazeDiffImage['data'],
  image2: BlazeDiffImage['data'],
  pos1: number,
  pos2: number
): number {
  const luma1 = getLuminance(image1, pos1);

  const luma2 = getLuminance(image2, pos2);

  return luma1 - luma2;
}

/**
 * Optimized anti-aliasing detection using luminance-based edge detection
 * Much faster than the original RGB-based approach
 */
function antialiased(
  image: BlazeDiffImage['data'],
  x1: number,
  y1: number,
  width: number,
  height: number,
  a32: Uint32Array,
  b32: Uint32Array
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const pos = y1 * width + x1;
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;
  let min = 0;
  let max = 0;
  let minX = 0;
  let minY = 0;
  let maxX = 0;
  let maxY = 0;

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;

      // Fast luminance delta instead of complex color delta
      const delta = luminanceDelta(image, image, pos * 4, (y * width + x) * 4);

      // count the number of equal, darker and brighter adjacent pixels
      if (delta === 0) {
        zeroes++;
        // if found more than 2 equal siblings, it's definitely not anti-aliasing
        if (zeroes > 2) return false;

        // remember the darkest pixel
      } else if (delta < min) {
        min = delta;
        minX = x;
        minY = y;

        // remember the brightest pixel
      } else if (delta > max) {
        max = delta;
        maxX = x;
        maxY = y;
      }
    }
  }

  // if there are no both darker and brighter pixels among siblings, it's not anti-aliasing
  if (min === 0 || max === 0) return false;

  // if either the darkest or the brightest pixel has 3+ equal siblings in both images
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
  height: number
): boolean {
  const x0 = Math.max(x1 - 1, 0);
  const y0 = Math.max(y1 - 1, 0);
  const x2 = Math.min(x1 + 1, width - 1);
  const y2 = Math.min(y1 + 1, height - 1);
  const val = image[y1 * width + x1];
  let zeroes = x1 === x0 || x1 === x2 || y1 === y0 || y1 === y2 ? 1 : 0;

  // go through 8 adjacent pixels
  for (let x = x0; x <= x2; x++) {
    for (let y = y0; y <= y2; y++) {
      if (x === x1 && y === y1) continue;
      zeroes += +(val === image[y * width + x]);
      if (zeroes > 2) return true;
    }
  }
  return false;
}

/**
 * Draw a colored pixel to the output buffer
 */
function drawPixel(
  output: BlazeDiffImage['data'],
  position: number,
  r: number,
  g: number,
  b: number
): void {
  output[position + 0] = r;
  output[position + 1] = g;
  output[position + 2] = b;
  output[position + 3] = 255;
}

/**
 * Draw a grayscale pixel to the output buffer
 */
function drawGrayPixel(
  image: BlazeDiffImage['data'],
  index: number,
  alpha: number,
  output: BlazeDiffImage['data']
): void {
  const value =
    255 +
    ((image[index] * 0.29889531 +
      image[index + 1] * 0.58662247 +
      image[index + 2] * 0.11448223 -
      255) *
      alpha *
      image[index + 3]) /
      255;
  drawPixel(output, index, value, value, value);
}
