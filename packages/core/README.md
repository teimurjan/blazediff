# @blazediff/core

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)

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

### blazediff(image1, image2, output, width, height, options)

Compare two images and return the number of different pixels.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>First image data</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>Second image data</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>Optional output buffer for diff visualization</td>
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
    <td>Comparison options (optional)</td>
  </tr>
</table>

<strong>Returns:</strong> Number of different pixels

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
    <th width="500">Hint</th>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0-1)</td>
    <td>Lower values = more sensitive. 0.05 for strict comparison, 0.2+ for loose comparison</td>
  </tr>
  <tr>
    <td><code>alpha</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Background image opacity</td>
    <td>Controls how faded unchanged pixels appear in diff output</td>
  </tr>
  <tr>
    <td><code>aaColor</code></td>
    <td>[number, number, number]</td>
    <td>[255,255,0]</td>
    <td>Anti-aliasing pixel color</td>
    <td>Yellow by default. Set to red [255,0,0] to highlight anti-aliasing</td>
  </tr>
  <tr>
    <td><code>diffColor</code></td>
    <td>[number, number, number]</td>
    <td>[255,0,0]</td>
    <td>Different pixel color</td>
    <td>Red by default. Use contrasting colors for better visibility</td>
  </tr>
  <tr>
    <td><code>diffColorAlt</code></td>
    <td>[number, number, number]</td>
    <td>-</td>
    <td>Alternative color for dark differences</td>
    <td>Helps distinguish light vs dark pixel changes</td>
  </tr>
  <tr>
    <td><code>includeAA</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Include anti-aliasing in diff count</td>
    <td>Set true to count anti-aliasing pixels as actual differences</td>
  </tr>
  <tr>
    <td><code>diffMask</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Output only differences (transparent background)</td>
    <td>Useful for creating overlay masks or highlighting changes only</td>
  </tr>
  <tr>
    <td><code>fastBufferCheck</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Use fast buffer check using Buffer.compare</td>
    <td>Set to false if images are processed differently, but look similiar</td>
  </tr>
</table>

## Usage

```typescript
import { diff } from '@blazediff/core';

const diffCount = diff(
  image1.data,
  image2.data,
  outputData,
  width,
  height,
  {
    threshold: 0.1,
    alpha: 0.1,
    aaColor: [255, 255, 0],
    diffColor: [255, 0, 0],
    includeAA: false,
    diffMask: false,
    fastBufferCheck: true,
  }
);
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
