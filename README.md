# BlazeDiff

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)](https://www.npmjs.com/org/blazediff)
[![Test](https://github.com/teimurjan/blazediff/actions/workflows/test.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/test.yml)
[![Release](https://github.com/teimurjan/blazediff/actions/workflows/release.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/release.yml)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/teimurjan/blazediff)

</div>

<div align="center"><img src="./packages/website/public/android-chrome-512x512.png" /></div>

**BlazeDiff** — a high-performance diff ecosystem for JavaScript applications. Originally built as a pixel-perfect image comparison library that's 1.5x faster than [pixelmatch](https://github.com/mapbox/pixelmatch), BlazeDiff has evolved into a comprehensive suite of blazing-fast diff tools including image comparison, object diffing, perceptual quality metrics, web components, and React components for visualizing differences.

## Available Packages

### Core Libraries
- **[@blazediff/core](./packages/core#readme)** - Pixel-perfect image comparison (1.5x faster than pixelmatch)
- **[@blazediff/object](./packages/object#readme)** - High-performance object diffing with detailed change tracking
- **[@blazediff/ssim](./packages/ssim#readme)** - SSIM, MS-SSIM, and Hitchhiker's SSIM for perceptual quality assessment
- **[@blazediff/gmsd](./packages/gmsd#readme)** - Gradient Magnitude Similarity Deviation metric

### Command Line Tools
- **[@blazediff/bin](./packages/bin#readme)** - CLI with multiple algorithms (diff, GMSD, SSIM, MS-SSIM, Hitchhiker's SSIM)

### UI Components
- **[@blazediff/react](./packages/react#readme)** - React components for diff visualization
- **[@blazediff/ui](./packages/ui#readme)** - Framework-agnostic web components

## Quick Links

- **[Documentation](https://blazediff.dev/docs)** - Complete API reference and guides
- **[Examples](https://blazediff.dev/examples)** - Interactive demos and code samples
- **[Benchmarks](./BENCHMARKS.md)** - Performance comparisons and metrics

## Performance

BlazeDiff delivers significant performance improvements across all components:

- **Image Pixel-by-Pixel**: ~50% faster than pixelmatch (up to 88% on identical images)
- **SSIM**: ~25% faster than ssim.js, ~70% faster with Hitchhiker's SSIM
- **Object Diff**: ~55% faster than microdiff (up to 96% on identical arrays)

**[View Detailed Benchmarks](./BENCHMARKS.md)** - Complete performance data, test methodology, and hardware specifications.

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

### Algorithm Licenses

The `@blazediff/ssim` and `@blazediff/gmsd` packages implement perceptual quality metrics based on published research. See the [licenses](./licenses) folder for detailed attribution and licensing information:

- **[SSIM](./licenses/SSIM.md)** - Zhou Wang et al., IEEE 2004
- **[MS-SSIM](./licenses/MS-SSIM.md)** - Zhou Wang et al., Asilomar 2003
- **[Hitchhiker's SSIM](./licenses/HITCHHIKERS-SSIM.md)** - Venkataramanan et al., IEEE Access 2021

## Acknowledgments

- Image diffing built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm
- SSIM and MS-SSIM based on groundbreaking research by Zhou Wang, Alan C. Bovik, and colleagues
- Hitchhiker's SSIM based on research by Venkataramanan, Wu, Bovik, Katsavounidis, and Shahid
- GMSD based on research by Xue, Zhang, Mou, and Bovik

---

**Built for high-performance difference detection across images and data structures**
