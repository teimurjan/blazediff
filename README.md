# BlazeDiff 🔥

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

</div>

<div align="center"><img src="./assets/logo.png" /></div>

BlazeDiff 🔥 — a blazing-fast, pixel-perfect image comparison library for JavaScript. Up-to 60% faster than [pixelmatch](https://github.com/mapbox/pixelmatch), with identical accuracy and output quality. It uses an innovative block-based algorithm to achieve blazing-fast pixel-by-pixel image diffing. Built on the foundation of [pixelmatch](https://github.com/mapbox/pixelmatch) but with significant optimizations, it's designed for visual testing, CI/CD pipelines, and any application requiring fast, accurate image comparison.

*🔄 100% API and Result Compatible: BlazeDiff is fully compatible with [pixelmatch](https://github.com/mapbox/pixelmatch)'s API and produces identical results when using the YIQ color space flag.*

## 🚀 Performance

BlazeDiff is **~up-to 60% faster** than pixelmatch while maintaining the same accuracy and output quality. The performance improvement comes from:

- **Block-based algorithm**: First pass creates dynamic-sized blocks and only processes changed blocks
- **Zero memory allocation**: Uses `Int32Array` for blocks and `Uint32Array` for images
- **Early exit optimization**: Returns immediately if no differences are detected
- **32-bit integer comparisons**: Leverages CPU vectorization for faster pixel matching
- **YCbCr instead of YIQ**: Utilized a simpler color space encoding for maximum performance 

### Benchmarks

### Algorithm (`@blazediff/core`)

ℹ️ 50 iterations (3 warmup)

```
BlazeDiff   | █████████████████████████████████  91.90ms 🔥
Pixelmatch  | ██████████████████████████████████████  115.09ms
```

<table>
  <thead>
    <tr>
      <th width="500">Image</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Pixelmatch</th>
      <th width="500">Speedup</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.57ms</td>
      <td>1.04ms</td>
      <td>45.67%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.93ms</td>
      <td>2.56ms</td>
      <td>-14.66%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.40ms</td>
      <td>0.94ms</td>
      <td>57.38%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>6.83ms</td>
      <td>4.98ms</td>
      <td>-37.14%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.19ms</td>
      <td>0.47ms</td>
      <td>59.95%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.96ms</td>
      <td>1.14ms</td>
      <td>16.27%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.51ms</td>
      <td>2.33ms</td>
      <td>35.11%</td>
    </tr>
    <tr>
      <td>4k/1</td>
      <td>275.64ms</td>
      <td>345.94ms</td>
      <td>20.32%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>283.92ms</td>
      <td>352.60ms</td>
      <td>19.48%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>346.02ms</td>
      <td>438.87ms</td>
      <td>21.16%</td>
    </tr>
    <tr>
      <td><strong>AVERAGE</strong></td>
      <td><strong>91.90ms</strong></td>
      <td><strong>115.09ms</strong></td>
      <td><strong>22.35%</strong></td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Binary (`@blazediff/bin` with `@blazediff/sharp-transformer`)

ℹ️ 50 iterations (3 warmup)

```
BlazeDiff   | █████████████  418.32ms 🔥🔥🔥
Pixelmatch  | ████████████████████████████████████████████████████████████████  2155.48ms
```

<table>
  <thead>
    <tr>
      <th width="500">Image</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Pixelmatch</th>
      <th width="500">Speedup</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>415.26ms</td>
      <td>1923.01ms</td>
      <td>78.41%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>422.32ms</td>
      <td>2173.85ms</td>
      <td>80.57%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>417.37ms</td>
      <td>2369.58ms</td>
      <td>82.39%</td>
    </tr>
    <tr>
      <td><strong>AVERAGE</strong></td>
      <td><strong>418.32ms</strong></td>
      <td><strong>2155.48ms</strong></td>
      <td><strong>80.45%</strong></td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Benchmarks in GitHub Actions

[benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

## 🏗️ Architecture

The project is organized into modular packages for maximum flexibility:

```
@blazediff/
├── core          # Core comparison algorithm
├── bin           # Command-line interface
├── types         # Shared TypeScript types
├── pngjs-transformer    # PNG.js-based image transformer
└── sharp-transformer    # Native Sharp-based transformer (faster)
```

## 📦 Installation

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

## 🎯 Usage

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
    yiq: false              // Use YCbCr color space
  }
);

console.log(`Found ${diffCount} different pixels`);
```

### 🔧 Configuration Options

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
    <tr>
      <td><code>yiq</code></td>
      <td><code>boolean</code></td>
      <td><code>false</code></td>
      <td>Use YIQ instead of the default YCbCr color space</td>
    </tr>
  </tbody>
</table>

## 💻 CLI

```bash
# Basic comparison
blazediff image1.png image2.png

# Save diff image with custom threshold
blazediff image1.png image2.png -o diff.png -t 0.05

# Use Sharp transformer for better performance
blazediff image1.png image2.png --transformer sharp -o diff.png

# Custom colors and options
blazediff image1.png image2.png \
  --threshold 0.2 \
  --alpha 0.3 \
  --aa-color 0,255,255 \
  --diff-color 255,0,255 \
  --include-aa \
  --diff-mask \
  --diff-mask \
  --transformer sharp \
  --yiq
```

### ⚡ Transformers

BlazeDiff supports multiple image transformers:

- **PNG.js Transformer** (`@blazediff/pngjs-transformer`): Pure JavaScript, works everywhere
- **Sharp Transformer** (`@blazediff/sharp-transformer`): Native bindings, significantly faster

## 🧪 Testing & Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run benchmarks
pnpm benchmark
```

## 🤝 Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm

---

**Made with ❤️ for blazing-fast image comparison**
