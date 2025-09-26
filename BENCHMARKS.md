# BlazeDiff Benchmarks

Performance benchmarks comparing BlazeDiff ecosystem components against popular alternatives.

## Algorithm (`@blazediff/core` vs `pixelmatch`)

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

## Binary (`@blazediff/bin` with `@blazediff/sharp-transformer`)

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

## Object (`@blazediff/object`)

*10000 iterations (50 warmup)*

> **~30%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Microdiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>complex object - tag addition</td>
      <td>0.0024ms</td>
      <td>0.0009ms</td>
      <td>0.0015ms</td>
      <td>61.6%</td>
    </tr>
    <tr>
      <td>deep nested - timeout change</td>
      <td>0.0009ms</td>
      <td>0.0010ms</td>
      <td>-0.0001ms</td>
      <td>-13.7%</td>
    </tr>
    <tr>
      <td>large array - single item change</td>
      <td>0.2846ms</td>
      <td>0.1741ms</td>
      <td>0.1105ms</td>
      <td>38.8%</td>
    </tr>
    <tr>
      <td>large identical arrays</td>
      <td>0.0541ms</td>
      <td>0.0020ms</td>
      <td>0.0522ms</td>
      <td>96.4%</td>
    </tr>
    <tr>
      <td>large nested object - multiple small changes</td>
      <td>2.1848ms</td>
      <td>1.4859ms</td>
      <td>0.6989ms</td>
      <td>32.0%</td>
    </tr>
    <tr>
      <td>nested object - theme change</td>
      <td>0.0015ms</td>
      <td>0.0008ms</td>
      <td>0.0007ms</td>
      <td>45.5%</td>
    </tr>
    <tr>
      <td>simple object - age change</td>
      <td>0.0004ms</td>
      <td>0.0004ms</td>
      <td>0.0000ms</td>
      <td>2.0%</td>
    </tr>
    <tr>
      <td>simple object - identical</td>
      <td>0.0001ms</td>
      <td>0.0002ms</td>
      <td>-0.0000ms</td>
      <td>-5.7%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td><strong>2.53ms</strong></td>
      <td><strong>1.67ms</strong></td>
      <td><strong>0.86ms</strong></td>
      <td><strong>34.1%</strong></td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

## GitHub Actions

Automated benchmarks run on every commit:

- [benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-algorithm.yml) - Core algorithm benchmarks
- [benchmark-binary.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-binary.yml) - Binary/CLI benchmarks
- [benchmark-object.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-object.yml) - Object diffing benchmarks

## Test Fixtures

### Image Fixtures
The image benchmark fixtures used for testing are documented in the [fixtures README](./packages/benchmark/fixtures/README.md).

### Object Fixtures
The object benchmark fixtures are documented in the [object fixtures README](./packages/benchmark/src/object/fixtures/README.md).

## Hardware Specifications

All benchmarks are run on consistent hardware:

- **CPU**: Apple M1 Max
- **Runtime**: Node.js 22
- **OS**: macOS

## Methodology

### Image Benchmarks
- **Iterations**: 50 runs with 3 warmup iterations
- **Measurements**: Time per comparison operation
- **Scenarios**: Various image sizes (4k, page screenshots, pixelmatch test cases)
- **Edge Cases**: Identical images (tests early exit optimization)

### Object Benchmarks
- **Iterations**: 10,000 runs with 50 warmup iterations
- **Measurements**: Time per diff operation
- **Scenarios**: Simple objects, nested structures, large arrays, enterprise data
- **Edge Cases**: Identical objects, sparse changes, deep nesting

### Binary Benchmarks
- **Iterations**: 50 runs with 3 warmup iterations
- **Measurements**: End-to-end time including image loading and processing
- **Format Support**: PNG, JPEG, WebP via Sharp transformer
- **Real-world Performance**: Includes file I/O and format conversion overhead

## Performance Insights

### Key Strengths

**Image Diffing**:
- **88%+ faster** on identical images due to early exit optimization
- **Block-based algorithm** provides consistent 7-10% improvements on changed images
- **Native buffer comparisons** leverage CPU optimizations

**Object Diffing**:
- **96% faster** on identical large arrays (early exit optimization)
- **30-60% faster** on complex nested objects
- **Memory efficient** with consistent object shapes for V8 optimization

**Binary Processing**:
- **55-75% faster** end-to-end including image loading
- **Format agnostic** performance improvements
- **CLI efficiency** maintains performance gains in real-world usage

### Areas for Improvement

- Very simple object comparisons show minimal improvement (overhead of optimizations)
- Some micro-benchmarks show slight regression due to additional safety checks
- Performance varies by data structure complexity and change patterns

---

**Continuous benchmarking ensures performance regressions are caught early and improvements are validated across the entire BlazeDiff ecosystem.**