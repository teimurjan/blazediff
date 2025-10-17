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

**Returns:** Similarity score [0..1] where 1 = identical

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

console.log(`Similarity: ${(score * 100).toFixed(2)}%`);

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

## Algorithm

GMSD measures perceptual image similarity by analyzing gradient magnitude patterns:

1. **Luma Conversion**: RGBA → grayscale using BT.601 (Y = 0.299R + 0.587G + 0.114B)
2. **Optional Downsampling**: 2x box filter for performance
3. **Gradient Computation**: Prewitt operator (3x3) computes gradient magnitudes
4. **Similarity Mapping**: GMS(x,y) = (2×GM₁×GM₂ + C) / (GM₁² + GM₂² + C)
5. **Score Calculation**: score = 1 - stddev(GMS), range [0..1]

**Key Features:**
- Uses **Prewitt operator** (not Sobel) matching original MATLAB implementation
- Single-scale (no multi-scale pyramid)
- No Gaussian windows (faster than SSIM)
- Structure-aware (gradient-based, not pixel-based)

For detailed mathematical formulas and verification, see [FORMULA.md](./FORMULA.md).

## Performance

Benchmarks on 1920×1080 images:

| Method | Speed | Use Case |
|--------|-------|----------|
| @blazediff/core (pixel diff) | 1.67ms | Fast pixel-perfect comparison |
| @blazediff/gmsd (full-res) | 5.73ms | Perceptual similarity |
| @blazediff/gmsd (2x downsample) | 3.13ms | Fast perceptual similarity |
| ssim.js | 36.90ms | High-quality structural similarity |

**Performance Tips:**
- Use `downsample: 1` for 2x speedup with minimal accuracy loss
- GMSD is 4-6× slower than pixel diff but 7× faster than SSIM
- For RGBA images, luma conversion adds ~10% overhead

## GMS Map Visualization

When an output buffer is provided, GMSD generates a grayscale similarity map:

```typescript
const output = new Uint8ClampedArray(width * height * 4);
gmsd(image1, image2, output, width, height, {});

// output contains RGBA grayscale map:
// - Bright areas = similar gradient structures
// - Dark areas = different gradient structures
// - 1px border = black (no gradient computed)

// Save as PNG for debugging
await saveToPNG(output, width, height, 'similarity-map.png');
```

## When to Use GMSD vs Pixel Diff

**Use GMSD when:**
- Comparing images with minor rendering differences (anti-aliasing, text rendering)
- Detecting perceptual changes vs pixel-perfect changes
- Need structure-aware comparison (edges, gradients)
- Comparing screenshots with slight variations

**Use pixel diff (@blazediff/core) when:**
- Need pixel-perfect comparison
- Detecting any visual change whatsoever
- Speed is critical
- Working with synthetic images (diagrams, UI mockups)

## Limitations

- **Uniform images**: Returns score = 1.0 for flat/uniform images (no gradients to compare)
- **Gradient-only**: Focuses on edges and structure, not color or brightness
- **Single-scale**: May miss multi-resolution artifacts
- **Border**: 1px border excluded from gradient computation

## References

Based on the paper:
> Xue, W., Zhang, L., Mou, X., & Bovik, A. C. (2013). "Gradient Magnitude Similarity Deviation: A Highly Efficient Perceptual Image Quality Index." IEEE Transactions on Image Processing, 22(2), 684-695.

- [Original MATLAB implementation](http://www4.comp.polyu.edu.hk/~cslzhang/IQA/GMSD/GMSD.htm)
- [Mathematical formula verification](./FORMULA.md)

## License

MIT