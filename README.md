# BlazeDiff

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![NPM](https://img.shields.io/badge/NPM-%40blazediff-red?style=for-the-badge)](https://www.npmjs.com/org/blazediff)
[![JSR](https://img.shields.io/badge/JSR-%40blazediff-f7df1e?style=for-the-badge&logo=jsr&logoColor=083344)](https://jsr.io/@blazediff)
[![Test](https://img.shields.io/github/actions/workflow/status/teimurjan/blazediff/test.yml?style=for-the-badge&label=test)](https://github.com/teimurjan/blazediff/actions/workflows/test.yml)
[![Release](https://img.shields.io/github/actions/workflow/status/teimurjan/blazediff/release.yml?style=for-the-badge&label=release)](https://github.com/teimurjan/blazediff/actions/workflows/release.yml)
[![Ask DeepWiki](https://img.shields.io/badge/Ask-DeepWiki-blue?style=for-the-badge)](https://deepwiki.com/teimurjan/blazediff)

</div>

<div align="center"><img src="./apps/website/public/android-chrome-512x512.png" /></div>

**BlazeDiff** is a high-performance diff ecosystem. Originally built in JavaScript as a pixel-perfect image comparison library that's 1.5x faster than [pixelmatch](https://github.com/mapbox/pixelmatch). Now, BlazeDiff has evolved into a comprehensive suite of blazing-fast diff tools including image comparison, image diff analysis determenistically + agent-in-the-loop verdict, object diffing, perceptual quality metrics, web components, and React components for visualizing differences.

## Available Packages

### Core Libraries
- **[@blazediff/core-native](./packages/core-native#readme)** - The fastest single-threaded image diff in the world (Rust + SIMD, 3-4x faster than odiff on 4K images)
- **[@blazediff/core-wasm](./packages/core-wasm#readme)** - WebAssembly build of the same Rust algorithm (wasm32 + v128 SIMD, ~58% faster than pixelmatch). For browsers, edge runtimes, and any wasm host.
- **[@blazediff/core](./packages/core#readme)** - Pixel-perfect image comparison (1.5x faster than pixelmatch)
- **[@blazediff/object](./packages/object#readme)** - High-performance object diffing with detailed change tracking
- **[@blazediff/ssim](./packages/ssim#readme)** - SSIM, MS-SSIM, and Hitchhiker's SSIM for perceptual quality assessment
- **[@blazediff/gmsd](./packages/gmsd#readme)** - Gradient Magnitude Similarity Deviation metric

### Command Line Tools
- **[@blazediff/cli](./packages/cli#readme)** - JS CLI with multiple algorithms (diff, GMSD, SSIM, MS-SSIM, Hitchhiker's SSIM)
- **[@blazediff/agent](./packages/agent#readme)** - Agentic visual regression. Auto-discovers routes, captures deterministic screenshots, and hands ambiguous diffs back to your coding agent (Claude Code, Cursor, Codex) to judge.

### UI Components
- **[@blazediff/react](./packages/react#readme)** - React components for diff visualization
- **[@blazediff/ui](./packages/ui#readme)** - Framework-agnostic web components

## Quick Links

- **[Documentation](https://blazediff.dev/docs)** - Complete API reference and guides
- **[Examples](https://blazediff.dev/examples)** - Interactive demos and code samples
- **[Benchmarks](./BENCHMARKS.md)** - Performance comparisons and metrics

## Installation

BlazeDiff packages are dual-published. Install from whichever registry fits your runtime.

```sh
# Node / Bun via npm
npm install @blazediff/core
bun i @blazediff/core

# Deno / Bun via JSR
deno add jsr:@blazediff/core
bunx jsr add @blazediff/core
```

Every package above is available on both registries **except** the test-runner adapters (`@blazediff/vitest`, `@blazediff/jest`, `@blazediff/bun`) and the UI libraries (`@blazediff/ui`, `@blazediff/react`), which remain NPM-only - the adapters augment each runner's `Matchers` types and the UI packages have web-component return-type requirements that JSR's publish-time check doesn't allow. Native-binary sub-packages under `@blazediff/core-native-*` are also NPM-only; Deno consumers resolve them transparently via `npm:` specifiers declared inside `@blazediff/core-native`.

## Performance

BlazeDiff delivers significant performance improvements across all components:

- **Native (Rust)**: 3-4x faster than odiff, 8x faster than pixelmatch on 4K images
- **WebAssembly (wasm32 + v128 SIMD)**: ~58% faster than pixelmatch on average, up to ~5x on 4K (browser, edge, any wasm host)
- **Image Pixel-by-Pixel (JS)**: ~50% faster than pixelmatch (up to 88% on identical images)
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
