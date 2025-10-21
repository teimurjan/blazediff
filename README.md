# BlazeDiff

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-algorithm.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-algorithm.yml)
[![Object Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-object.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-object.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/teimurjan/blazediff)

</div>

<div align="center"><img src="./assets/logo.png" /></div>

**BlazeDiff** — a high-performance diff ecosystem for JavaScript applications. Originally built as a pixel-perfect image comparison library that's 1.5x faster than [pixelmatch](https://github.com/mapbox/pixelmatch), BlazeDiff has evolved into a comprehensive suite of blazing-fast diff tools including image comparison, object diffing, web components, and React components for visualizing differences. Designed for visual testing, CI/CD pipelines, data validation, and any application requiring fast, accurate comparison operations.

## Features

BlazeDiff provides a complete ecosystem of high-performance diff tools:

- **Image Diff**: Pixel-perfect image comparison with 1.5x performance improvement over pixelmatch
- **Object Diff**: Lightning-fast structural object comparison with detailed change tracking
- **Web Components**: Framework-agnostic components for displaying diffs in web applications
- **React Components**: Purpose-built React components for seamless diff visualization

## Image Diff

BlazeDiff's image comparison is **1.5x faster** than pixelmatch while maintaining identical accuracy and output quality. The performance improvement comes from:

- **Block-based algorithm**: Dynamic-sized blocks with processing only for changed areas
- **Early exit optimization**: Immediate return for identical images (Native C++ in Node)
- **32-bit integer comparisons**: CPU vectorization for faster pixel matching
- **Multiple format support**: PNG, JPEG, and WebP when using Sharp transformer

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
      <td align="center"><img src="./assets/1b.jpeg" alt="Actual" width="50%" /></td>
      <td align="center"><img src="./assets/1diff.png" alt="Diff" width="50%" /></td>
    </tr>
  </tbody>
</table>

*100% API and Result Compatible: BlazeDiff is fully compatible with [pixelmatch](https://github.com/mapbox/pixelmatch)'s API and produces identical results when using the YIQ color space flag.*

## Object Diff

BlazeDiff's object comparison provides blazing-fast structural diffing with comprehensive change detection:

- **High-performance algorithm**: Optimized for speed with intelligent key lookup strategies
- **Detailed change tracking**: Precise path tracking for nested object modifications
- **Comprehensive type support**: Handles primitives, objects, arrays, dates, regex, and circular references
- **Memory efficient**: Minimal overhead with consistent object shapes for V8 optimization

<table>
  <thead>
    <tr>
      <th width="33.3%">Original</th>
      <th width="33.3%">Modified</th>
      <th width="33.3%">Changes</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>
        <pre><code>{
  "name": "John",
  "age": 30,
  "city": "NYC",
  "skills": ["JS", "TS"]
}</code></pre>
      </td>
      <td>
        <pre><code>{
  "name": "John",
  "age": 31,
  "city": "SF",
  "skills": ["JS", "TS", "Go"],
  "active": true
}</code></pre>
      </td>
      <td>
        <pre><code>[
  {
    "type": 2,
    "path": ["age"],
    "value": 31,
    "oldValue": 30
  },
  {
    "type": 2,
    "path": ["city"],
    "value": "SF",
    "oldValue": "NYC"
  },
  {
    "type": 0,
    "path": ["skills", 2],
    "value": "Go",
    "oldValue": undefined
  },
  {
    "type": 0,
    "path": ["active"],
    "value": true,
    "oldValue": undefined
  }
]</code></pre>
      </td>
    </tr>
  </tbody>
</table>

**Difference Types:**
- `0` (CREATE) - Property or array element was added
- `1` (REMOVE) - Property or array element was deleted
- `2` (CHANGE) - Property or array element value was modified

## Use Cases

BlazeDiff is available in multiple packages to suit different use cases:

### Core Libraries
- **[@blazediff/core](./packages/core#readme)** - Core JavaScript library for pixel-perfect image comparison
- **[@blazediff/object](./packages/object#readme)** - High-performance object diffing with detailed change tracking
- **[@blazediff/ssim](./packages/ssim#readme)** - Perceptual quality metrics (SSIM, MS-SSIM)
- **[@blazediff/gmsd](./packages/gmsd#readme)** - Gradient Magnitude Similarity Deviation metric

### Command Line Tools
- **[@blazediff/bin](./packages/bin#readme)** - CLI with multiple comparison algorithms (diff, GMSD, SSIM, MS-SSIM) and format support

### UI Components
- **[@blazediff/react](./packages/react#readme)** - React components for displaying diffs in your applications
- **[@blazediff/ui](./packages/ui#readme)** - Framework-agnostic web components for diff visualization

## Benchmarks

BlazeDiff delivers significant performance improvements across all components:

- **Image Diff**: ~50% faster than pixelmatch (up to 88% on identical images)
- **Object Diff**: ~30% faster than microdiff (up to 96% on identical arrays)
- **CLI Tools**: ~60% faster end-to-end performance with multi-format support

**[View Detailed Benchmarks](./BENCHMARKS.md)** - Complete performance data, test methodology, and hardware specifications.

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

### Algorithm Licenses

The `@blazediff/ssim` package implements perceptual quality metrics based on published research. See the [licenses](./licenses) folder for detailed attribution and licensing information:

- **[SSIM](./licenses/SSIM.md)** - Zhou Wang et al., IEEE 2004
- **[MS-SSIM](./licenses/MS-SSIM.md)** - Zhou Wang et al., Asilomar 2003

## Acknowledgments

- Image diffing built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm
- SSIM and MS-SSIM based on groundbreaking research by Zhou Wang, Alan C. Bovik, and colleagues

---

**Built for high-performance difference detection across images and data structures**