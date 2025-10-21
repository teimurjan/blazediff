# @blazediff/ssim

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fssim)](https://www.npmjs.com/package/@blazediff/ssim)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fssim)](https://www.npmjs.com/package/@blazediff/ssim)

</div>

Fast SSIM (Structural Similarity Index) implementations for perceptual image quality assessment. Includes standard SSIM, MS-SSIM (Multi-Scale SSIM), and Hitchhiker's SSIM for various use cases and performance requirements.

**Features:**
- **Three SSIM Variants** - Standard SSIM, MS-SSIM, and Hitchhiker's SSIM
- **MATLAB-compatible** - Matches reference implementation with <0.01% error
- **High Performance** - Optimized implementations with ~4x faster Hitchhiker's SSIM
- **Perceptual Metrics** - Structural similarity scoring (0-1 scale)
- **SSIM Map Output** - Optional grayscale visualization
- **Zero Dependencies**
- **TypeScript Support** out of the box

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
    <td>Uint8Array, Uint8ClampedArray, or Buffer</td>
    <td>First image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array, Uint8ClampedArray, or Buffer</td>
    <td>Second image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array, Uint8ClampedArray, Buffer, or undefined</td>
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

**Returns:** `number` - SSIM score (0-1, where 1 is identical)

#### Options

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>windowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Size of the Gaussian window</td>
  </tr>
  <tr>
    <td><code>k1</code></td>
    <td>number</td>
    <td>0.01</td>
    <td>Algorithm parameter for luminance</td>
  </tr>
  <tr>
    <td><code>k2</code></td>
    <td>number</td>
    <td>0.03</td>
    <td>Algorithm parameter for contrast</td>
  </tr>
  <tr>
    <td><code>L</code></td>
    <td>number</td>
    <td>255</td>
    <td>Dynamic range of pixel values</td>
  </tr>
</table>

### `msssim(image1, image2, output, width, height, options?)`

Compares two images using the Multi-Scale SSIM (MS-SSIM) algorithm and returns a similarity score.

Same parameters as `ssim()`, but analyzes images at multiple scales (default: 5 levels) for better perceptual accuracy.

**Returns:** `number` - MS-SSIM score (0-1, where 1 is identical)

#### Options

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>windowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Size of the Gaussian window</td>
  </tr>
  <tr>
    <td><code>scales</code></td>
    <td>number</td>
    <td>5</td>
    <td>Number of scales to use</td>
  </tr>
  <tr>
    <td><code>weights</code></td>
    <td>number[]</td>
    <td>[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]</td>
    <td>Weights for each scale</td>
  </tr>
  <tr>
    <td><code>method</code></td>
    <td>'product' or 'sum'</td>
    <td>'product'</td>
    <td>Aggregation method</td>
  </tr>
</table>

### `hitchhikersSSIM(image1, image2, output, width, height, options?)`

Compares two images using Hitchhiker's SSIM (fast rectangular-window version with integral images).

**Performance:** ~4x faster than standard SSIM using integral images for O(1) window computation.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array, Uint8ClampedArray, or Buffer</td>
    <td>First image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array, Uint8ClampedArray, or Buffer</td>
    <td>Second image data (RGBA format, 4 bytes per pixel)</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array, Uint8ClampedArray, Buffer, or undefined</td>
    <td>Optional output buffer for SSIM map</td>
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
    <td>HitchhikersSsimOptions</td>
    <td>SSIM computation options (optional)</td>
  </tr>
</table>

**Returns:** `number` - SSIM score (0-1, where 1 is identical)

#### Options

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>windowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Size of the rectangular window</td>
  </tr>
  <tr>
    <td><code>windowStride</code></td>
    <td>number</td>
    <td>windowSize</td>
    <td>Stride for window sliding (non-overlapping by default)</td>
  </tr>
  <tr>
    <td><code>covPooling</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Use Coefficient of Variation pooling (recommended)</td>
  </tr>
  <tr>
    <td><code>k1</code></td>
    <td>number</td>
    <td>0.01</td>
    <td>Algorithm parameter for luminance</td>
  </tr>
  <tr>
    <td><code>k2</code></td>
    <td>number</td>
    <td>0.03</td>
    <td>Algorithm parameter for contrast</td>
  </tr>
  <tr>
    <td><code>L</code></td>
    <td>number</td>
    <td>255</td>
    <td>Dynamic range of pixel values</td>
  </tr>
</table>

## Usage

### Basic SSIM Comparison

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

### Hitchhiker's SSIM (Fast)

```typescript
import hitchhikersSSIM from '@blazediff/ssim/hitchhikers-ssim';

// ~4x faster than standard SSIM
const score = hitchhikersSSIM(image1.data, image2.data, undefined, width, height);

console.log(`Hitchhiker's SSIM: ${score.toFixed(4)}`);

// With custom options
const scoreCustom = hitchhikersSSIM(image1.data, image2.data, undefined, width, height, {
  windowSize: 16,
  windowStride: 8,  // Overlapping windows
  covPooling: true, // CoV pooling (recommended)
});
```

### Custom Options

```typescript
import ssim from '@blazediff/ssim/ssim';

// Basic SSIM with custom window size
const score = ssim(image1, image2, undefined, width, height, {
  windowSize: 7,  // Smaller window for more local detail
  k1: 0.01,
  k2: 0.03,
  L: 255
});

// MS-SSIM with custom scales and method
import msssim from '@blazediff/ssim/msssim';

const msScore = msssim(image1, image2, undefined, width, height, {
  scales: 5,           // Number of scales (default: 5)
  method: 'product',   // 'product' or 'sum'
  windowSize: 11
});
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

## When to Use Each Variant

**Use SSIM when:**
- You need **MATLAB-compatible results** for research or comparison
- You want **high accuracy** with Gaussian weighting
- You need **automatic downsampling** for large images
- Performance is not critical

**Use MS-SSIM when:**
- You need **multi-scale analysis** for better perceptual correlation
- You're working with images at **different resolutions**
- You want **better correlation with human perception**
- You can afford the ~2-3x computation cost

**Use Hitchhiker's SSIM when:**
- You need **maximum performance** (~4x faster than standard SSIM)
- You're processing **large images** or **many images**
- You want **O(1) window computation** regardless of window size
- You need **flexible window stride** for overlapping/non-overlapping windows
- CoV pooling provides better perceptual correlation than mean

## Score Interpretation

| Score Range | Similarity Level | Description |
| ----------- | ---------------- | ----------- |
| `1.0`       | Identical        | Images are identical or perceptually identical |
| `0.99+`     | Excellent        | Extremely high similarity (minor compression artifacts) |
| `0.95-0.99` | Very Good        | High similarity (small compression or noise) |
| `0.90-0.95` | Good             | Noticeable but acceptable differences |
| `0.80-0.90` | Fair             | Significant but tolerable differences |
| `<0.80`     | Poor             | Major structural differences |

## References

### SSIM & MS-SSIM
- **Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P.** (2004). [Image quality assessment: from error visibility to structural similarity](https://ieeexplore.ieee.org/document/1284395). IEEE Transactions on Image Processing, 13(4), 600-612.
- **Wang, Z., Simoncelli, E. P., & Bovik, A. C.** (2003). [Multi-scale structural similarity for image quality assessment](https://ieeexplore.ieee.org/document/1292216). IEEE Asilomar Conference on Signals, Systems & Computers.
- **MATLAB Reference Implementations**: [Zhou Wang's Research Group](https://ece.uwaterloo.ca/~z70wang/research/ssim/)

### Hitchhiker's SSIM
- **Venkataramanan, A. K., Wu, C., Bovik, A. C., Katsavounidis, I., & Shahid, Z.** (2021). [A Hitchhiker's Guide to Structural Similarity](https://ieeexplore.ieee.org/document/9345560). IEEE Access, 9, 28872-28896.
- **Reference Implementation**: [utlive/enhanced_ssim](https://github.com/utlive/enhanced_ssim)
- **License**: BSD-2-Clause-Patent (Netflix, Inc.)

## License

See [../../licenses](../../licenses) for algorithm attribution and licensing information.
