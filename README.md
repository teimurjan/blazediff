# BlazeDiff

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

</div>

<div align="center"><img src="./assets/logo.png" /></div>

**BlazeDiff** — a high-performance, pixel-perfect image comparison library for JavaScript. Up-to 60% faster than [pixelmatch](https://github.com/mapbox/pixelmatch), with identical accuracy and output quality. It uses an innovative block-based algorithm to achieve blazing-fast pixel-by-pixel image diffing. Built on the foundation of [pixelmatch](https://github.com/mapbox/pixelmatch) but with significant optimizations, it's designed for visual testing, CI/CD pipelines, and any application requiring fast, accurate image comparison.

*100% API and Result Compatible: BlazeDiff is fully compatible with [pixelmatch](https://github.com/mapbox/pixelmatch)'s API and produces identical results when using the YIQ color space flag.*

## Features

BlazeDiff is **~up-to 60% faster** than pixelmatch while maintaining the same accuracy and output quality. The performance improvement comes from:

- **Block-based algorithm**: First pass creates dynamic-sized blocks and only processes changed blocks
- **Early exit optimization**: Returns immediately if no differences are detected
- **32-bit integer comparisons**: Leverages CPU vectorization for faster pixel matching
- **JPEG and WebP support**: When using the binary with the Sharp transformer, BlazeDiff supports PNG, JPEG and WebP inputs.

<table>
  <thead>
    <tr>
      <th width="33.3%">Expected</th>
      <th width="33.3%">Actual</th>
      <th width="33.3%">Diff</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="./assets/1a.jpeg" alt="Expected" width="50%" /></td>
      <td align="center"><img src="./assets/1b.jpeg" alt="Expected" width="50%" /></td>
      <td align="center"><img src="./assets/1diff.png" alt="Expected" width="50%" /></td>
    </tr>
  </tbody>
</table>


## Benchmarks

### Algorithm (`@blazediff/core` vs `pixelmatch`)

*50 iterations (3 warmup)*

> **~20%** performance boost on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Pixelmatch</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>282.05ms</td>
      <td>242.31ms</td>
      <td>39.74ms</td>
      <td>14.1%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>275.85ms</td>
      <td>241.57ms</td>
      <td>34.28ms</td>
      <td>12.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>348.24ms</td>
      <td>299.91ms</td>
      <td>48.33ms</td>
      <td>13.9%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>191.12ms</td>
      <td>94.40ms</td>
      <td>96.72ms</td>
      <td>50.6%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>361.73ms</td>
      <td>332.45ms</td>
      <td>29.28ms</td>
      <td>8.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.60ms</td>
      <td>0.40ms</td>
      <td>0.20ms</td>
      <td>33.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.03ms</td>
      <td>1.92ms</td>
      <td>0.11ms</td>
      <td>5.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.48ms</td>
      <td>0.25ms</td>
      <td>0.23ms</td>
      <td>47.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>3.86ms</td>
      <td>3.52ms</td>
      <td>0.34ms</td>
      <td>8.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.27ms</td>
      <td>0.18ms</td>
      <td>0.09ms</td>
      <td>33.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.81ms</td>
      <td>0.74ms</td>
      <td>0.07ms</td>
      <td>8.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.38ms</td>
      <td>1.04ms</td>
      <td>0.34ms</td>
      <td>24.6%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Binary (`@blazediff/bin` with `@blazediff/sharp-transformer`)

*50 iterations (3 warmup)*

> **~80%** performance boost on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Pixelmatch</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>1659.10ms</td>
      <td>863.63ms</td>
      <td>795.47ms</td>
      <td>47.9%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1853.29ms</td>
      <td>960.11ms</td>
      <td>893.18ms</td>
      <td>48.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>2029.28ms</td>
      <td>1003.78ms</td>
      <td>1025.50ms</td>
      <td>50.5%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>2328.74ms</td>
      <td>818.71ms</td>
      <td>1510.03ms</td>
      <td>64.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>1833.51ms</td>
      <td>913.13ms</td>
      <td>920.38ms</td>
      <td>50.2%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Benchmarks in GitHub Actions

[benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

## Installation

### Core Library
```bash
npm install @blazediff/core
# or
pnpm add @blazediff/core
# or
yarn add @blazediff/core
```

### Command Line Tool
```bash
npm install -g @blazediff/bin
# or
pnpm add -g @blazediff/bin
# or
yarn global add @blazediff/bin
```

## Usage

```typescript
import blazediff from '@blazediff/core';
import pngjsTransformer from '@blazediff/pngjs-transformer';

const [image1, image2] = await Promise.all([
  pngjsTransformer.transform('./image1.png'),
  pngjsTransformer.transform('./image2.png'),
])

const outputData = new Uint8Array(image1.data.length);

const diffCount = blazediff(
  image1.data,              // Uint8Array | Uint8ClampedArray
  image2.data,              // Uint8Array | Uint8ClampedArray
  outputData,               // Optional output data
  width: image.width,       // Image width
  height: image.height,     // Image height
  {
    threshold: 0.1,         // Color difference threshold (0-1)
    alpha: 0.1,             // Background opacity
    aaColor: [255, 255, 0], // Anti-aliasing color (yellow)
    diffColor: [255, 0, 0], // Difference color (red)
    includeAA: false,       // Include anti-aliasing in diff
    diffMask: false         // Output only differences
  }
);

console.log(`Found ${diffCount} different pixels`);
```

### Configuration Options

<table>
  <thead>
    <tr>
      <th width="500">Option</th>
      <th width="500">Type</th>
      <th width="500">Default</th>
      <th width="500">Description</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><code>threshold</code></td>
      <td><code>number</code></td>
      <td><code>0.1</code></td>
      <td>Color difference threshold (0-1)</td>
    </tr>
    <tr>
      <td><code>alpha</code></td>
      <td><code>number</code></td>
      <td><code>0.1</code></td>
      <td>Background image opacity</td>
    </tr>
    <tr>
      <td><code>aaColor</code></td>
      <td><code>[r,g,b]</code></td>
      <td><code>[255,255,0]</code></td>
      <td>Anti-aliasing pixel color</td>
    </tr>
    <tr>
      <td><code>diffColor</code></td>
      <td><code>[r,g,b]</code></td>
      <td><code>[255,0,0]</code></td>
      <td>Different pixel color</td>
    </tr>
    <tr>
      <td><code>diffColorAlt</code></td>
      <td><code>[r,g,b]</code></td>
      <td>Same as <code>diffColor</code></td>
      <td>Alternative color for dark differences</td>
    </tr>
    <tr>
      <td><code>includeAA</code></td>
      <td><code>boolean</code></td>
      <td><code>false</code></td>
      <td>Include anti-aliasing in diff count</td>
    </tr>
    <tr>
      <td><code>diffMask</code></td>
      <td><code>boolean</code></td>
      <td><code>false</code></td>
      <td>Output only differences (transparent background)</td>
    </tr>
  </tbody>
</table>

## CLI

```bash
# Basic comparison
blazediff image1.png image2.png

# Save diff image with custom threshold
blazediff image1.png image2.png -o diff.png -t 0.05

# Use Sharp transformer for better performance
blazediff image1.png image2.png --transformer sharp -o diff.png

# JPEG support (requires Sharp transformer)
blazediff image1.jpg image2.jpg --transformer sharp -o diff.png

# Custom colors and options
blazediff image1.png image2.png \
  --threshold 0.2 \
  --alpha 0.3 \
  --aa-color 0,255,255 \
  --diff-color 255,0,255 \
  --include-aa \
  --diff-mask \
  --diff-mask \
  --transformer sharp
```

### Transformers

BlazeDiff supports multiple image transformers:

- **PNG.js Transformer** (`@blazediff/pngjs-transformer`): Pure JavaScript, works everywhere. Supports PNG.
- **Sharp Transformer** (`@blazediff/sharp-transformer`): Native bindings, significantly faster. Supports PNG and JPEG.

## Testing & Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run benchmarks
pnpm benchmark
```

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm

---

**Built for high-performance image comparison**
