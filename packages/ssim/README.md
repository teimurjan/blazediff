# @blazediff/ssim

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fssim?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/ssim)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fssim?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/ssim)

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

All three functions take two images of the same size and one options object:

```typescript
interface Image {
  data: Uint8Array | Uint8ClampedArray; // RGBA, width * height * 4 bytes. Buffer works too.
  width: number;
  height: number;
}

type SsimResult =
  | { kind: "compared"; score: number } // 0-1, 1 when identical
  | { kind: "dimension-mismatch"; a: Size; b: Size };
```

Images of different sizes return `kind: "dimension-mismatch"`. A buffer that does not hold `width * height * 4` bytes, or an `output` of the wrong size, throws.

### `ssim(a, b, options?)`

Standard SSIM with a Gaussian window and automatic downsampling to about 256px on the short edge, like MATLAB's `ssim.m`.

### `msssim(a, b, options?)`

SSIM pooled across a dyadic pyramid, like `msssim.m`. The default five scales need at least 176px on the short edge.

### `hitchhikersSSIM(a, b, options?)`

Box windows over integral images, pooled by coefficient of variation (Venkataramanan et al. 2021). It is about 4x faster than standard SSIM.

### Options

`SsimOptions` is one type for all three functions. Its field names match `@blazediff/ssim-native`. Each function reads the shared fields and its own block, and ignores the other blocks.

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
    <td>Side of the local window</td>
  </tr>
  <tr>
    <td><code>k1</code></td>
    <td>number</td>
    <td>0.01</td>
    <td>Luminance stability constant: <code>c1 = (k1·L)²</code></td>
  </tr>
  <tr>
    <td><code>k2</code></td>
    <td>number</td>
    <td>0.03</td>
    <td>Contrast stability constant: <code>c2 = (k2·L)²</code></td>
  </tr>
  <tr>
    <td><code>bitDepth</code></td>
    <td>number</td>
    <td>8</td>
    <td>Sample bit depth, setting <code>L = 2^bitDepth - 1</code></td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Image</td>
    <td>none</td>
    <td>Draws the local score map as grayscale: white is similar, black is different</td>
  </tr>
  <tr>
    <td><code>msSsim.weights</code></td>
    <td>number[]</td>
    <td>[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]</td>
    <td><code>msssim</code> only. Per-scale weights. The length sets the number of scales.</td>
  </tr>
  <tr>
    <td><code>msSsim.method</code></td>
    <td>'product' or 'weighted-sum'</td>
    <td>'product'</td>
    <td><code>msssim</code> only. How the per-scale scores combine.</td>
  </tr>
  <tr>
    <td><code>hitchhikers.windowStride</code></td>
    <td>number</td>
    <td>windowSize</td>
    <td><code>hitchhikersSSIM</code> only. Distance between window origins. The default gives non-overlapping windows.</td>
  </tr>
  <tr>
    <td><code>hitchhikers.covPooling</code></td>
    <td>boolean</td>
    <td>true</td>
    <td><code>hitchhikersSSIM</code> only. Pool with <code>1 - stddev/mean</code> instead of the plain mean.</td>
  </tr>
</table>

## Usage

### Basic SSIM Comparison

```typescript
import ssim from '@blazediff/ssim/ssim';

const result = ssim(image1, image2);

if (result.kind === 'compared' && result.score < 0.95) {
  throw new Error(`Images differ too much: ${result.score}`);
}
```

### Multi-Scale SSIM (MS-SSIM)

```typescript
import msssim from '@blazediff/ssim/msssim';

const result = msssim(image1, image2, {
  msSsim: { method: 'weighted-sum' },
});
```

### Hitchhiker's SSIM (Fast)

```typescript
import hitchhikersSSIM from '@blazediff/ssim/hitchhikers-ssim';

const result = hitchhikersSSIM(image1, image2, {
  windowSize: 16,
  hitchhikers: { windowStride: 8, covPooling: true }, // overlapping windows
});
```

### SSIM Map Visualization

```typescript
import ssim from '@blazediff/ssim/ssim';

const output = { data: new Uint8ClampedArray(width * height * 4), width, height };
const result = ssim(image1, image2, { output });

// output.data now holds the grayscale SSIM map.
// White (255) is high similarity, black (0) is low similarity.
```

### Migrating from 1.x

| 1.x | Now |
| --- | --- |
| `ssim(a.data, b.data, out, width, height, options)` | `ssim(a, b, { ...options, output: { data: out, width, height } })` |
| returns `number` | returns `{ kind: "compared", score }` |
| `L: 255` | `bitDepth: 8` |
| `msssim(..., { weight, level })` | `msssim(a, b, { msSsim: { weights } })`; the scale count is `weights.length` |
| `method: "wtd_sum"` | `msSsim: { method: "weighted-sum" }` |
| `hitchhikersSSIM(..., { windowStride, covPooling })` | `hitchhikersSSIM(a, b, { hitchhikers: { windowStride, covPooling } })` |

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
