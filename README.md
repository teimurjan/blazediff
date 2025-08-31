# BlazeDiff 🔥

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)
[![Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

<div align="center"><img src="./assets/logo.png" /></div>

> BlazeDiff 🔥 — a blazing-fast, pixel-perfect image comparison library for JavaScript.
Up-to 60% faster than pixelmatch, with identical accuracy and output quality.

BlazeDiff is a high-performance image comparison library that uses an innovative block-based algorithm to achieve blazing-fast pixel-by-pixel image diffing. Built on the foundation of pixelmatch but with significant optimizations, it's designed for visual testing, CI/CD pipelines, and any application requiring fast, accurate image comparison.

## 🚀 Performance

BlazeDiff is **~up-to 60% faster** than pixelmatch while maintaining the same accuracy and output quality. The performance improvement comes from:

- **Block-based algorithm**: First pass creates dynamic-sized blocks and only processes changed blocks
- **Zero memory allocation**: Uses `Int32Array` for blocks and `Uint32Array` for images
- **Early exit optimization**: Returns immediately if no differences are detected
- **32-bit integer comparisons**: Leverages CPU vectorization for faster pixel matching

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

### Core Library

```typescript
import blazediff from '@blazediff/core';

// Compare two images
const diffCount = blazediff(
  image1Data,    // Uint8Array | Uint8ClampedArray
  image2Data,    // Uint8Array | Uint8ClampedArray
  outputBuffer,  // Optional output buffer
  width,         // Image width
  height,        // Image height
  {
    threshold: 0.1,        // Color difference threshold (0-1)
    alpha: 0.1,            // Background opacity
    aaColor: [255, 255, 0], // Anti-aliasing color (yellow)
    diffColor: [255, 0, 0],  // Difference color (red)
    includeAA: false,       // Include anti-aliasing in diff
    diffMask: false         // Output only differences
  }
);

console.log(`Found ${diffCount} different pixels`);
```


### Binary Executable

#### Command Line Interface

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
  --diff-color 255,0,255 \
  --aa-color 0,255,255
```

#### Usage in JavaScript

```js
import blazeDiffBin from '@blazediff/bin'
import sharpTransformer from '@blazediff/sharp-transformer'

blazeDiffBin(
  './image1.png',
  './image2.png',
  {
    outputPath: './diff.png',
    transformer: sharpTransformer,
    coreOptions: {
      // @blazediff/core options
      threshold: 0.2
    },
  },
)
```


## ⚡ Transformers

BlazeDiff supports multiple image transformers:

- **PNG.js Transformer** (`@blazediff/pngjs-transformer`): Pure JavaScript, works everywhere
- **Sharp Transformer** (`@blazediff/sharp-transformer`): Native bindings, significantly faster

## 🔧 Configuration Options

| Option         | Type      | Default             | Description                                      |
| -------------- | --------- | ------------------- | ------------------------------------------------ |
| `threshold`    | `number`  | `0.1`               | Color difference threshold (0-1)                 |
| `alpha`        | `number`  | `0.1`               | Background image opacity                         |
| `aaColor`      | `[r,g,b]` | `[255,255,0]`       | Anti-aliasing pixel color                        |
| `diffColor`    | `[r,g,b]` | `[255,0,0]`         | Different pixel color                            |
| `diffColorAlt` | `[r,g,b]` | Same as `diffColor` | Alternative color for dark differences           |
| `includeAA`    | `boolean` | `false`             | Include anti-aliasing in diff count              |
| `diffMask`     | `boolean` | `false`             | Output only differences (transparent background) |

## 🏃‍♂️ Performance Benchmarks

### Algorithm Performance

ℹ️ 50 iterations (3 warmup)

| Image        | BlazeDiff   | Pixelmatch | Speedup  |
|--------------|-------------|------------|----------|
| pixelmatch/1 | 0.30ms      | 0.83ms     | 64.29%   |
| pixelmatch/2 | 0.34ms      | 2.05ms     | 83.40%   |
| pixelmatch/3 | 0.21ms      | 0.75ms     | 72.42%   |
| pixelmatch/4 | 0.86ms      | 4.08ms     | 78.97%   |
| pixelmatch/5 | 0.09ms      | 0.37ms     | 74.68%   |
| pixelmatch/6 | 0.19ms      | 0.90ms     | 78.49%   |
| pixelmatch/7 | 0.52ms      | 1.86ms     | 71.80%   |
| 4k/1         | 103.69ms    | 291.42ms   | 64.42%   |
| 4k/2         | 93.19ms     | 291.71ms   | 68.06%   |
| 4k/3         | 134.28ms    | 367.81ms   | 63.49%   |
| **AVERAGE**  | **33.37ms** | **96.18ms**| **72.00%** |

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Performance in CI

[benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

## 🧠 How It Works

### 1. Block-Based First Pass
- Divides image into dynamic-sized blocks based on dimensions
- Uses 32-bit integer comparison for ultra-fast block matching
- Stores only changed block coordinates in `Int32Array`

### 2. Early Exit Optimization
- If no blocks differ, returns immediately (0ms for identical images)
- Avoids unnecessary pixel-by-pixel processing

### 3. Selective Processing
- Only processes pixels within changed blocks
- Maintains pixelmatch's anti-aliasing detection
- Uses a simpler YCbCr instead of YIQ

### 4. Zero Allocation
- Reuses existing `Uint32Array` views on input buffers
- No temporary arrays or objects created during comparison

## 🎨 Output Formats

BlazeDiff generates visual diff images showing:
- **Red pixels**: Substantial differences
- **Yellow pixels**: Anti-aliasing artifacts
- **Grayscale background**: Original image with configurable opacity
- **Transparent background**: When using `diffMask: true`

## 🧪 Testing & Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r run build

# Run benchmarks
pnpm --filter @blazediff/benchmark run start
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm

---

**Made with ❤️ for blazing-fast image comparison**
