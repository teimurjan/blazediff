# @blazediff/ssim

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fssim)](https://www.npmjs.com/package/@blazediff/ssim)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fssim)](https://www.npmjs.com/package/@blazediff/ssim)

</div>

Fast single-threaded SSIM (Structural Similarity Index) implementation for perceptual image quality assessment. Perfect for CI visual testing where you need a similarity score based on structural information rather than pixel-by-pixel differences.

**Features:**
- Academic SSIM and MS-SSIM implementations matching MATLAB references
- **SSIMULACRA2** - Advanced perceptual metric detecting compression artifacts
- Perceptual similarity scoring (0-1 scale for SSIM/MS-SSIM, 0-100 for SSIMULACRA2)
- Optional SSIM map visualization
- Multi-scale analysis for better perceptual accuracy
- Zero dependencies
- TypeScript support out of the box

For detailed algorithm explanation and mathematical formulas, see [FORMULA.md](./FORMULA.md).

## Installation

```bash
npm install @blazediff/ssim
```

## API

### `ssim(image1, image2, output, width, height, options?)`

Compares two images using the standard SSIM algorithm with automatic downsampling and returns a similarity score.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array or Uint8ClampedArray</td>
    <td>First image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array or Uint8ClampedArray</td>
    <td>Second image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array, Uint8ClampedArray, or undefined</td>
    <td>Optional output buffer for SSIM map visualization (RGBA format)</td>
  </tr>
  <tr>
    <td><code>width</code></td>
    <td>number</td>
    <td>Image width in pixels</td>
  </tr>
  <tr>
    <td><code>height</code></td>
    <td>number</td>
    <td>Image height in pixels</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>SsimOptionsExtended</td>
    <td>SSIM computation options (optional)</td>
  </tr>
</table>

**Returns:** `number` - MSSIM score (0-1, where 1 is identical)

### `msssim(image1, image2, output, width, height, options?)`

Compares two images using the Multi-Scale SSIM (MS-SSIM) algorithm and returns a similarity score.

Same parameters as `ssim()`, but analyzes images at multiple scales (default: 5 levels) for better perceptual accuracy.

**Returns:** `number` - MS-SSIM score (0-1, where 1 is identical)

### `ssimulacra2(image1, image2, width, height)`

Compares two images using SSIMULACRA2, an advanced perceptual metric that detects compression artifacts, ringing, and blurring.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array or Uint8ClampedArray</td>
    <td>First image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array or Uint8ClampedArray</td>
    <td>Second image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>width</code></td>
    <td>number</td>
    <td>Image width in pixels</td>
  </tr>
  <tr>
    <td><code>height</code></td>
    <td>number</td>
    <td>Image height in pixels</td>
  </tr>
</table>

**Returns:** `Ssimulacra2Result` - Object containing:
- `score` - Perceptual quality score (0-100, higher is better)
- `scales` - Per-scale measurements for detailed analysis

**Score interpretation:**
- `100` - Identical or imperceptibly different
- `90-100` - Very high quality (barely noticeable differences)
- `70-90` - High quality (minor artifacts)
- `50-70` - Medium quality (visible artifacts)
- `30-50` - Low quality (significant artifacts)
- `<30` - Very low quality (severe artifacts)

##### Options

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
    <th width="500">Hint</th>
  </tr>
  <tr>
    <td><code>windowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Window size for local SSIM computation</td>
    <td>Larger windows = smoother results, smaller = more local detail</td>
  </tr>
  <tr>
    <td><code>k1</code></td>
    <td>number</td>
    <td>0.01</td>
    <td>First stability constant for luminance</td>
    <td>Default from original SSIM paper, rarely needs adjustment</td>
  </tr>
  <tr>
    <td><code>k2</code></td>
    <td>number</td>
    <td>0.03</td>
    <td>Second stability constant for contrast/structure</td>
    <td>Default from original SSIM paper, rarely needs adjustment</td>
  </tr>
  <tr>
    <td><code>bitDepth</code></td>
    <td>number</td>
    <td>8</td>
    <td>Bit depth of images (8 = 0-255 range)</td>
    <td>Use 8 for standard images, adjust for HDR</td>
  </tr>
</table>

## Usage

### Basic Comparison

```typescript
import ssim from '@blazediff/ssim/ssim';

const score = ssim(image1.data, image2.data, undefined, width, height);

console.log(`Similarity: ${score.toFixed(4)}`); // e.g., "Similarity: 0.9823"

// Use in tests
if (score < 0.95) {
  throw new Error(`Images differ too much: ${score}`);
}
```

### Multi-Scale SSIM (MS-SSIM)

```typescript
import msssim from '@blazediff/ssim/msssim';

// MS-SSIM provides better perceptual accuracy by analyzing at multiple scales
const score = msssim(image1.data, image2.data, undefined, width, height);

console.log(`MS-SSIM: ${score.toFixed(4)}`);
```

### Custom Options

```typescript
import ssim from '@blazediff/ssim/ssim';

// Basic SSIM with custom window size
const score = ssim(image1, image2, undefined, width, height, {
  windowSize: 7,  // Smaller window for more local detail
  k1: 0.01,
  k2: 0.03,
  bitDepth: 8
});

// MS-SSIM with custom scales and method
import msssim from '@blazediff/ssim/msssim';

const msScore = msssim(image1, image2, undefined, width, height, {
  scales: 5,           // Number of scales (default: 5)
  method: 'product',   // 'product' or 'wtd' (weighted sum)
  windowSize: 11
});
```

### SSIMULACRA2 (Advanced Perceptual Metric)

```typescript
import ssimulacra2 from '@blazediff/ssim/ssimulacra2';

// Without error map
const result = ssimulacra2(image1.data, image2.data, undefined, width, height);

console.log(`SSIMULACRA2 Score: ${result.score.toFixed(2)}`); // e.g., "92.45"

// Use in tests with appropriate threshold
if (result.score < 70) {
  throw new Error(`Image quality too low: ${result.score}`);
}

// Access detailed scale information
console.log(`Processed ${result.scales.length} scales`);
```

### SSIMULACRA2 with Error Map

```typescript
import ssimulacra2 from '@blazediff/ssim/ssimulacra2';

// Create output buffer for error map visualization
const output = new Uint8ClampedArray(width * height * 4);

const result = ssimulacra2(image1.data, image2.data, output, width, height);

// output now contains SSIM' error map from finest scale
// Black (0) = no error/high similarity
// White (255) = high error/low similarity
// Can be saved as PNG or displayed for debugging
console.log(`Score: ${result.score.toFixed(2)}`);
```

### SSIM Map Visualization

The SSIM map shows local similarity values as a grayscale image:

```typescript
import ssim from '@blazediff/ssim/ssim';

// Create output buffer for SSIM map
const output = new Uint8ClampedArray(width * height * 4);

const score = ssim(image1, image2, output, width, height);

// output now contains grayscale SSIM map
// White (255) = high similarity, Black (0) = low similarity
// Can be saved as PNG or displayed for debugging
```

## References

### SSIM & MS-SSIM
- **Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P.** (2004). [Image quality assessment: from error visibility to structural similarity](https://ieeexplore.ieee.org/document/1284395). IEEE Transactions on Image Processing, 13(4), 600-612.
- **Wang, Z., Simoncelli, E. P., & Bovik, A. C.** (2003). [Multi-scale structural similarity for image quality assessment](https://ieeexplore.ieee.org/document/1292216). IEEE Asilomar Conference on Signals, Systems & Computers.
- **MATLAB Reference Implementations**: [Zhou Wang's Research Group](https://ece.uwaterloo.ca/~z70wang/research/ssim/)

### SSIMULACRA2
- **Jon Sneyers** (Cloudinary, 2022-2023). SSIMULACRA 2: Structural SIMilarity Unveiling Local And Compression Related Artifacts
- **Reference Implementation**: [cloudinary/ssimulacra2](https://github.com/cloudinary/ssimulacra2)
- **Tuning Datasets**: CID22, TID2013, Kadid10k, KonFiG-IQA
- **XYB Color Space**: Based on JPEG XL color transformation
