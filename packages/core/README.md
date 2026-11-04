# @blazediff/core

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core)

</div>

High-performance pixel-by-pixel image comparison with two-pass block-based optimization and YIQ perceptual color difference. Up to 91% faster than pixelmatch on identical images, ~62% average improvement overall.

**Features:**
- YIQ color space for perceptual color difference
- Anti-aliasing detection and filtering
- Two-pass block-based optimization with 32-bit integer comparison
- Support for alpha channel and transparency

For detailed algorithm explanation and mathematical formulas, see [FORMULA.md](./FORMULA.md).

## Installation

```bash
npm install @blazediff/core
```

## API

### diff(a, b, options?)

Compares two RGBA images and returns a result object. `a` and `b` are `{ data, width, height }`, where `data` is a `Uint8Array`, `Uint8ClampedArray` or `Buffer` of `width * height * 4` bytes. Browser `ImageData` has this shape.

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0-1). Lower is stricter. With <code>yiq</code> it scales a squared distance. With <code>oklab</code>, 1 is black against white.</td>
  </tr>
  <tr>
    <td><code>antialiasing</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Detect anti-aliased pixels and leave them out of the count.</td>
  </tr>
  <tr>
    <td><code>metric</code></td>
    <td>"yiq" | "oklab"</td>
    <td>"yiq"</td>
    <td>Color difference metric. <code>oklab</code> is the OKLab HyAB metric of pixelmatch 8.</td>
  </tr>
  <tr>
    <td><code>mask</code></td>
    <td>Uint8Array</td>
    <td>-</td>
    <td>One byte per pixel (<code>width * height</code>). Pixels with a non-zero byte are skipped.</td>
  </tr>
  <tr>
    <td><code>window</code></td>
    <td>number</td>
    <td>-</td>
    <td>Also report the N×N window with the most diff pixels. N is clamped to [1, min(width, height)].</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Image</td>
    <td>-</td>
    <td>Draw the diff into this image. Omit it for a count-only comparison.</td>
  </tr>
  <tr>
    <td><code>render.alpha</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Opacity of the unchanged image in the output.</td>
  </tr>
  <tr>
    <td><code>render.diffColor</code></td>
    <td>[r, g, b]</td>
    <td>[255, 0, 0]</td>
    <td>Color of different pixels.</td>
  </tr>
  <tr>
    <td><code>render.diffColorAlt</code></td>
    <td>[r, g, b]</td>
    <td><code>diffColor</code></td>
    <td>Color of pixels that get darker in <code>b</code>.</td>
  </tr>
  <tr>
    <td><code>render.aaColor</code></td>
    <td>[r, g, b]</td>
    <td>[255, 255, 0]</td>
    <td>Color of detected anti-aliased pixels.</td>
  </tr>
  <tr>
    <td><code>render.background</code></td>
    <td>"faded" | "transparent"</td>
    <td>"faded"</td>
    <td><code>faded</code> draws a gray copy of <code>a</code> under the diff. <code>transparent</code> draws the diff alone.</td>
  </tr>
</table>

The result is one of two kinds:

```typescript
type DiffResult =
  | { kind: "compared"; count: number; percentage: number; identical: boolean;
      window?: { x: number; y: number; count: number } }
  | { kind: "dimension-mismatch"; a: Size; b: Size };
```

`count` is the number of pixels that differ beyond `threshold`, after the mask and the anti-aliasing exclusion. With `window`, `count` stays the total and `window` gives the top-left corner and count of the busiest window. Images of different sizes return `dimension-mismatch`. Invalid buffers or options throw a `BlazeDiffError` with a `code`: `invalid-image`, `invalid-output`, `invalid-mask` or `invalid-option`.

## Usage

```typescript
import { diff } from "@blazediff/core";

const output = { data: new Uint8Array(width * height * 4), width, height };
const result = diff(a, b, { threshold: 0.1, output });

if (result.kind === "compared" && !result.identical) {
  console.log(`${result.count} pixels differ (${result.percentage.toFixed(2)}%)`);
}

// OKLab metric, a skipped region and the busiest 16×16 window.
const mask = new Uint8Array(width * height); // 1 = skip this pixel
const worst = diff(a, b, { metric: "oklab", mask, window: 16 });
```

## Coming from pixelmatch

`@blazediff/core/pixelmatch` has the same signature, options, errors, counts and output bytes as pixelmatch 8.0.0. Change the import and nothing else:

```typescript
import pixelmatch from "@blazediff/core/pixelmatch";

const count = pixelmatch(img1.data, img2.data, output, width, height, { threshold: 0.1 });
```

## Algorithm

BlazeDiff uses a sophisticated multi-stage approach for high-performance image comparison:

1. **Block-Based Pre-filtering**: Divides images into adaptive blocks and uses 32-bit integer comparison to quickly identify unchanged regions
2. **YIQ Color Space**: Converts RGB to YIQ color space for perceptually accurate color difference measurement
3. **Anti-Aliasing Detection**: Implements the Vysniauskas (2009) algorithm to distinguish anti-aliasing artifacts from real differences
4. **Optimized Memory Access**: Zero-allocation design with cache-friendly memory patterns

See [FORMULA.md](./FORMULA.md) for detailed mathematical formulas and algorithm explanation.

## Performance

> **Average: ~62%** | Median: ~85% | Best case (identical): up to 91%

Benchmarked against pixelmatch across 34 fixtures (50 iterations, 5 warmup) on Apple M1 Max with Node.js 22. Full numbers in the root [BENCHMARKS.md](https://github.com/teimurjan/blazediff/blob/main/BENCHMARKS.md).

| Benchmark | Pixelmatch | BlazeDiff | Improvement |
|-----------|------------|-----------|-------------|
| 4k/1 (5600×3200) | 349.90ms | 172.60ms | **50.7%** |
| 4k/1 (identical) | 21.47ms | 3.52ms | **83.6%** |
| page/1 (3598×16384) | 147.00ms | 94.64ms | **35.6%** |
| page/1 (identical) | 70.36ms | 7.77ms | **89.0%** |
| small images | 0.2-4ms | 0.01-2ms | **30-91%** |

The block-based optimization provides the most benefit on identical images (~85-91% faster) and images with large unchanged regions.

## References

- **Algorithm Documentation**: [FORMULA.md](./FORMULA.md) - Complete mathematical foundation and formulas
- **YIQ Color Space**: [Kotsarenko & Ramos (2009)](https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad) - "Measuring perceived color difference using YIQ NTSC transmission color space"
- **Anti-Aliasing Detection**: [Vysniauskas (2009)](https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector) - "Anti-aliased Pixel and Intensity Slope Detector"
- **Inspiration**: [pixelmatch](https://github.com/mapbox/pixelmatch) - Original pixel-by-pixel diff algorithm
