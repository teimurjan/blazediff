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
      <td>360.33ms</td>
      <td>244.34ms</td>
      <td>115.99ms</td>
      <td>32.2%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>19.61ms</td>
      <td>2.50ms</td>
      <td>17.11ms</td>
      <td>87.3%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>362.80ms</td>
      <td>216.63ms</td>
      <td>146.17ms</td>
      <td>40.3%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>22.44ms</td>
      <td>2.65ms</td>
      <td>19.79ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>457.70ms</td>
      <td>275.89ms</td>
      <td>181.81ms</td>
      <td>39.7%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>26.34ms</td>
      <td>3.14ms</td>
      <td>23.20ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.44ms</td>
      <td>0.63ms</td>
      <td>0.80ms</td>
      <td>55.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.47ms</td>
      <td>0.04ms</td>
      <td>0.43ms</td>
      <td>90.8%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.73ms</td>
      <td>1.02ms</td>
      <td>0.71ms</td>
      <td>40.9%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.38ms</td>
      <td>0.04ms</td>
      <td>0.35ms</td>
      <td>90.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>12.40ms</td>
      <td>9.41ms</td>
      <td>2.99ms</td>
      <td>24.1%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.78ms</td>
      <td>0.20ms</td>
      <td>1.57ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>166.35ms</td>
      <td>92.65ms</td>
      <td>73.70ms</td>
      <td>44.3%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>64.63ms</td>
      <td>7.83ms</td>
      <td>56.80ms</td>
      <td>87.9%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>358.43ms</td>
      <td>272.50ms</td>
      <td>85.93ms</td>
      <td>24.0%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>45.98ms</td>
      <td>5.47ms</td>
      <td>40.50ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.53ms</td>
      <td>0.50ms</td>
      <td>0.03ms</td>
      <td>5.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>91.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.55ms</td>
      <td>1.84ms</td>
      <td>0.71ms</td>
      <td>27.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.46ms</td>
      <td>0.25ms</td>
      <td>0.21ms</td>
      <td>46.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.14ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.79ms</td>
      <td>3.37ms</td>
      <td>1.42ms</td>
      <td>29.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.20ms</td>
      <td>0.02ms</td>
      <td>0.18ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.29ms</td>
      <td>0.18ms</td>
      <td>0.11ms</td>
      <td>37.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.80ms</td>
      <td>0.72ms</td>
      <td>0.08ms</td>
      <td>10.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.46ms</td>
      <td>1.04ms</td>
      <td>0.41ms</td>
      <td>28.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.27ms</td>
      <td>0.02ms</td>
      <td>0.24ms</td>
      <td>90.8%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>1.89ms</td>
      <td>0.21ms</td>
      <td>1.68ms</td>
      <td>88.7%</td>
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
      <th width="500">
        Pixelmatch
      </th>
      <th width="500">
        BlazeDiff
      </th>
    </tr>
  </thead>
</thead>
<tbody>
<tr>
<td>

```
./node_modules/.bin/pixelmatch ./fixtures/4k/1a.png ./fixtures/4k/1b.png
  Time (mean ± σ):      1.454 s ±  0.045 s    [User: 1.427 s, System: 0.058 s]
  Range (min … max):    1.425 s …  1.647 s    25 runs

./node_modules/.bin/pixelmatch ./fixtures/4k/2a.png ./fixtures/4k/2b.png
  Time (mean ± σ):      1.611 s ±  0.010 s    [User: 1.585 s, System: 0.063 s]
  Range (min … max):    1.601 s …  1.650 s    25 runs

./node_modules/.bin/pixelmatch ./fixtures/4k/3a.png ./fixtures/4k/3b.png
  Time (mean ± σ):      1.779 s ±  0.016 s    [User: 1.755 s, System: 0.070 s]
  Range (min … max):    1.763 s …  1.822 s    25 runs

./node_modules/.bin/pixelmatch ./fixtures/page/1a.png ./fixtures/page/1b.png
  Time (mean ± σ):      2.144 s ±  0.070 s    [User: 2.045 s, System: 0.166 s]
  Range (min … max):    2.060 s …  2.336 s    25 runs

./node_modules/.bin/pixelmatch ./fixtures/page/2a.png ./fixtures/page/2b.png
  Time (mean ± σ):      1.546 s ±  0.034 s    [User: 1.504 s, System: 0.067 s]
  Range (min … max):    1.502 s …  1.650 s    25 runs
```

</td>
<td>

```
./node_modules/.bin/blazediff ./fixtures/4k/1a.png ./fixtures/4k/1b.png --transformer sharp
  Time (mean ± σ):     573.2 ms ±  17.1 ms    [User: 760.6 ms, System: 58.3 ms]
  Range (min … max):   557.2 ms … 628.6 ms    25 runs

./node_modules/.bin/blazediff ./fixtures/4k/2a.png ./fixtures/4k/2b.png --transformer sharp
  Time (mean ± σ):     647.4 ms ±  23.8 ms    [User: 904.6 ms, System: 66.1 ms]
  Range (min … max):   628.0 ms … 720.6 ms    25 runs

./node_modules/.bin/blazediff ./fixtures/4k/3a.png ./fixtures/4k/3b.png --transformer sharp
  Time (mean ± σ):     714.3 ms ±  17.2 ms    [User: 985.0 ms, System: 69.7 ms]
  Range (min … max):   701.3 ms … 778.8 ms    25 runs

./node_modules/.bin/blazediff ./fixtures/page/1a.png ./fixtures/page/1b.png --transformer sharp
  Time (mean ± σ):     519.2 ms ±  25.5 ms    [User: 750.5 ms, System: 108.8 ms]
  Range (min … max):   489.1 ms … 570.9 ms    25 runs

./node_modules/.bin/blazediff ./fixtures/page/2a.png ./fixtures/page/2b.png --transformer sharp
  Time (mean ± σ):     540.9 ms ±  14.1 ms    [User: 600.7 ms, System: 89.2 ms]
  Range (min … max):   525.3 ms … 593.2 ms    25 runs
```

</td>
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
