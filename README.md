# BlazeDiff

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM Version](https://img.shields.io/npm/v/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![Benchmark](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml/badge.svg)](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/teimurjan/blazediff)

</div>

<div align="center"><img src="./assets/logo.png" /></div>

**BlazeDiff** — a high-performance, pixel-perfect image comparison library for JavaScript. 1.5x faster than [pixelmatch](https://github.com/mapbox/pixelmatch), with identical accuracy and output quality. It uses an innovative block-based algorithm to achieve blazing-fast pixel-by-pixel image diffing. Built on the foundation of [pixelmatch](https://github.com/mapbox/pixelmatch) but with significant optimizations, it's designed for visual testing, CI/CD pipelines, and any application requiring fast, accurate image comparison.

*100% API and Result Compatible: BlazeDiff is fully compatible with [pixelmatch](https://github.com/mapbox/pixelmatch)'s API and produces identical results when using the YIQ color space flag.*

## Features

BlazeDiff is **1.5x faster** than pixelmatch while maintaining the same accuracy and output quality. The performance improvement comes from:

- **Block-based algorithm**: First pass creates dynamic-sized blocks and only processes changed blocks
- **Early exit optimization**: Returns immediately if no buffer differences are detected (Native C++ in Node)
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

> **~50%** performance improvement on average.

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
      <td>294.86ms</td>
      <td>274.29ms</td>
      <td>20.57ms</td>
      <td>7.0%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>19.74ms</td>
      <td>2.33ms</td>
      <td>17.41ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>295.46ms</td>
      <td>274.97ms</td>
      <td>20.49ms</td>
      <td>6.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>22.10ms</td>
      <td>2.59ms</td>
      <td>19.51ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>373.39ms</td>
      <td>344.06ms</td>
      <td>29.32ms</td>
      <td>7.9%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>26.61ms</td>
      <td>3.11ms</td>
      <td>23.51ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>321.33ms</td>
      <td>92.50ms</td>
      <td>228.83ms</td>
      <td>71.2%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>66.57ms</td>
      <td>7.66ms</td>
      <td>58.91ms</td>
      <td>88.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>418.13ms</td>
      <td>375.39ms</td>
      <td>42.75ms</td>
      <td>10.2%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>45.99ms</td>
      <td>5.42ms</td>
      <td>40.57ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.86ms</td>
      <td>0.52ms</td>
      <td>0.34ms</td>
      <td>39.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.08ms</td>
      <td>2.01ms</td>
      <td>0.07ms</td>
      <td>3.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.77ms</td>
      <td>0.31ms</td>
      <td>0.46ms</td>
      <td>59.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.15ms</td>
      <td>3.93ms</td>
      <td>0.22ms</td>
      <td>5.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.20ms</td>
      <td>0.02ms</td>
      <td>0.18ms</td>
      <td>90.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.24ms</td>
      <td>0.14ms</td>
      <td>0.11ms</td>
      <td>43.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.92ms</td>
      <td>0.89ms</td>
      <td>0.03ms</td>
      <td>2.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.90ms</td>
      <td>1.35ms</td>
      <td>0.55ms</td>
      <td>29.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.28ms</td>
      <td>0.03ms</td>
      <td>0.25ms</td>
      <td>90.6%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Binary (`@blazediff/bin` with `@blazediff/sharp-transformer`)

*50 iterations (3 warmup)*

> **~60%** performance improvement on average.

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
      <td>1832.83ms</td>
      <td>818.00ms</td>
      <td>1014.84ms</td>
      <td>55.4%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>1480.47ms</td>
      <td>499.92ms</td>
      <td>980.55ms</td>
      <td>66.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1927.86ms</td>
      <td>856.67ms</td>
      <td>1071.18ms</td>
      <td>55.6%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>1589.19ms</td>
      <td>565.47ms</td>
      <td>1023.72ms</td>
      <td>64.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>2071.07ms</td>
      <td>927.41ms</td>
      <td>1143.66ms</td>
      <td>55.2%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>1707.19ms</td>
      <td>574.57ms</td>
      <td>1132.62ms</td>
      <td>66.3%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>2420.72ms</td>
      <td>737.27ms</td>
      <td>1683.44ms</td>
      <td>69.5%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>2169.74ms</td>
      <td>547.40ms</td>
      <td>1622.34ms</td>
      <td>74.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>1866.68ms</td>
      <td>750.66ms</td>
      <td>1116.02ms</td>
      <td>59.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>1490.23ms</td>
      <td>362.18ms</td>
      <td>1128.05ms</td>
      <td>75.7%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### Benchmarks in GitHub Actions

[benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark.yml)

## Contributing

Contributions are welcome! Please see the [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built on the excellent [pixelmatch](https://github.com/mapbox/pixelmatch) algorithm

---

**Built for high-performance image comparison**
