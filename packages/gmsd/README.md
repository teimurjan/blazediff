# @blazediff/gmsd

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fgmsd)](https://www.npmjs.com/package/@blazediff/gmsd)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fgmsd)](https://www.npmjs.com/package/@blazediff/gmsd)

</div>

High-performance GMSD (Gradient Magnitude Similarity Deviation) perceptual image quality metric. Structure-aware similarity scoring using Prewitt gradients on luma channel.

## Installation

```bash
npm install @blazediff/gmsd
```

## API

### gmsd(image1, image2, output, width, height, options)

Compare two images using GMSD perceptual similarity metric and return a similarity score.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>First image data (RGBA or grayscale)</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>Second image data (RGBA or grayscale)</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array | Uint8ClampedArray | undefined</td>
    <td>Optional output buffer for GMS similarity map visualization</td>
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
    <td>object</td>
    <td>GMSD options (optional)</td>
  </tr>
</table>

**Returns:** GMSD score where 0 = identical, higher values = more differences (typically 0-0.35 range)

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
    <th width="500">Hint</th>
  </tr>
  <tr>
    <td><code>downsample</code></td>
    <td>0 | 1</td>
    <td>0</td>
    <td>Downsampling factor</td>
    <td>0 = full resolution, 1 = 2x downsample (faster, slight accuracy loss)</td>
  </tr>
  <tr>
    <td><code>c</code></td>
    <td>number</td>
    <td>170</td>
    <td>Stability constant</td>
    <td>Prevents division by zero. 170 is from original MATLAB implementation for 8-bit images</td>
  </tr>
</table>

## Usage

```typescript
import { gmsd } from '@blazediff/gmsd';

// Basic comparison
const score = gmsd(
  image1.data,
  image2.data,
  undefined,
  width,
  height,
  {
    downsample: 0,
    c: 170,
  }
);

// Lower score = better quality (0 = perfect match)
console.log(`GMSD score: ${score.toFixed(4)}`);

// With GMS map output for visualization
const output = new Uint8ClampedArray(width * height * 4);
const score = gmsd(
  image1.data,
  image2.data,
  output, // Will be filled with grayscale similarity map
  width,
  height,
  {}
);

// output now contains:
// - White pixels (255): identical gradient structure
// - Black pixels (0): different gradient structure
// - Gray shades: partial similarity
```

## References

Based on the paper:
> Xue, W., Zhang, L., Mou, X., & Bovik, A. C. (2013). "Gradient Magnitude Similarity Deviation: A Highly Efficient Perceptual Image Quality Index." IEEE Transactions on Image Processing, 22(2), 684-695.

- [Original MATLAB implementation](http://www4.comp.polyu.edu.hk/~cslzhang/IQA/GMSD/GMSD.htm)
- [Mathematical formula verification](./FORMULA.md)

