# @blazediff/gmsd

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fgmsd?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/gmsd)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fgmsd?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/gmsd)

</div>

High-performance GMSD (Gradient Magnitude Similarity Deviation) perceptual image quality metric. Structure-aware similarity scoring using Prewitt gradients on luma channel.

## Installation

```bash
npm install @blazediff/gmsd
```

## API

### gmsd(a, b, options?)

Compares two RGBA images of the same size and returns a GMSD score.

```typescript
interface Image {
  data: Uint8Array | Uint8ClampedArray; // RGBA, width * height * 4 bytes. Buffer works too.
  width: number;
  height: number;
}

type GmsdResult =
  | { kind: "compared"; score: number } // 0 when identical, higher is more different (typically 0-0.35)
  | { kind: "dimension-mismatch"; a: Size; b: Size };
```

Images of different sizes return `kind: "dimension-mismatch"`. A buffer that does not hold `width * height * 4` bytes, or an `output` of the wrong size, throws.

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
  <tr>
    <td><code>output</code></td>
    <td>Image</td>
    <td>none</td>
    <td>Draws the gradient similarity map</td>
    <td>White is identical gradient structure, black is different, gray is partial similarity</td>
  </tr>
</table>

## Usage

```typescript
import { gmsd } from '@blazediff/gmsd';

const result = gmsd(image1, image2, { downsample: 0, c: 170 });

// Lower score = better quality (0 = perfect match)
if (result.kind === 'compared') console.log(`GMSD score: ${result.score.toFixed(4)}`);

// With the GMS map drawn into an RGBA buffer
const output = { data: new Uint8ClampedArray(width * height * 4), width, height };
gmsd(image1, image2, { output });
```

### Migrating from 1.x

| 1.x | Now |
| --- | --- |
| `gmsd(a.data, b.data, out, width, height, options)` | `gmsd(a, b, { ...options, output: { data: out, width, height } })` |
| returns `number` | returns `{ kind: "compared", score }` |
| grayscale input (1 byte per pixel) | RGBA input only |

## References

Based on the paper:
> Xue, W., Zhang, L., Mou, X., & Bovik, A. C. (2013). "Gradient Magnitude Similarity Deviation: A Highly Efficient Perceptual Image Quality Index." IEEE Transactions on Image Processing, 22(2), 684-695.

- [Original MATLAB implementation](http://www4.comp.polyu.edu.hk/~cslzhang/IQA/GMSD/GMSD.htm)
- [Mathematical formula verification](./FORMULA.md)

