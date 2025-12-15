# BlazeDiff Benchmarks

Performance benchmarks comparing BlazeDiff ecosystem components against popular alternatives.

## Table of Contents

- [BlazeDiff Benchmarks](#blazediff-benchmarks)
  - [Table of Contents](#table-of-contents)
  - [Native Binary (`@blazediff/bin` vs `odiff` vs `pixelmatch`)](#native-binary-blazediffbin-vs-odiff-vs-pixelmatch)
  - [Pixel By Pixel](#pixel-by-pixel)
    - [JavaScript (`@blazediff/core` vs `pixelmatch`)](#javascript-blazediffcore-vs-pixelmatch)
    - [CLI (`@blazediff/cli` with `@blazediff/sharp-transformer` vs `pixelmatch`)](#cli-blazediffcli-with-blazediffsharp-transformer-vs-pixelmatch)
  - [SSIM](#ssim)
    - [Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm)](#fast-original--blazediffssim-using-ssim-vs-ssimjs-using-fast-algorithm)
    - [Optimized (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm)](#optimized-blazediffssim-using-hitchhikers-ssim-vs-ssimjs-using-weber-algorithm)
  - [Object (`@blazediff/object` vs `microdiff`)](#object-blazediffobject-vs-microdiff)
  - [GitHub Actions](#github-actions)
  - [Test Fixtures](#test-fixtures)
    - [Image Fixtures](#image-fixtures)
    - [Object Fixtures](#object-fixtures)
  - [Hardware Specifications](#hardware-specifications)

## Native Binary (`@blazediff/bin` vs `odiff` vs `pixelmatch`)

*25 runs (5 warmup)*

> **2-3x faster than odiff**, **6-10x faster than pixelmatch** on 4K images.

The native Rust binary with SIMD optimization is the fastest single-threaded image diff in the world.

<table>
  <thead>
    <tr>
      <th width="400">Benchmark</th>
      <th width="300">blazediff (Rust)</th>
      <th width="300">odiff</th>
      <th width="300">blazediff-cli (JS)</th>
      <th width="300">pixelmatch</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>4k/1</strong> (5600×3200)</td>
      <td><strong>421ms</strong></td>
      <td>1227ms (2.9x slower)</td>
      <td>1362ms (3.2x slower)</td>
      <td>2773ms (6.6x slower)</td>
    </tr>
    <tr>
      <td><strong>4k/2</strong> (5600×3200)</td>
      <td><strong>477ms</strong></td>
      <td>1554ms (3.3x slower)</td>
      <td>1963ms (4.1x slower)</td>
      <td>3239ms (6.8x slower)</td>
    </tr>
    <tr>
      <td><strong>4k/3</strong> (5600×3200)</td>
      <td><strong>543ms</strong></td>
      <td>1738ms (3.2x slower)</td>
      <td>2148ms (4.0x slower)</td>
      <td>3632ms (6.7x slower)</td>
    </tr>
    <tr>
      <td><strong>page/1</strong> (3598×16384)</td>
      <td><strong>594ms</strong></td>
      <td>1105ms (1.9x slower)</td>
      <td>1331ms (2.2x slower)</td>
      <td>5719ms (9.6x slower)</td>
    </tr>
    <tr>
      <td><strong>page/2</strong> (3598×16384)</td>
      <td><strong>485ms</strong></td>
      <td>654ms (1.3x slower)</td>
      <td>1326ms (2.7x slower)</td>
      <td>3936ms (8.1x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/1</strong> (512×256)</td>
      <td><strong>14.7ms</strong></td>
      <td>17.2ms (1.2x slower)</td>
      <td>83.8ms (5.7x slower)</td>
      <td>87.2ms (5.9x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/2</strong> (400×300)</td>
      <td><strong>17.0ms</strong> (odiff)</td>
      <td>17.0ms (1.0x)</td>
      <td>88.5ms (5.2x slower)</td>
      <td>76.4ms (4.5x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/3</strong> (512×256)</td>
      <td><strong>19.2ms</strong> (odiff)</td>
      <td>19.2ms (1.0x)</td>
      <td>84.7ms (4.4x slower)</td>
      <td>82.1ms (4.3x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/4</strong> (544×384)</td>
      <td><strong>18.8ms</strong></td>
      <td>21.6ms (1.1x slower)</td>
      <td>101.3ms (5.4x slower)</td>
      <td>99.1ms (5.3x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/5</strong> (400×300)</td>
      <td><strong>15.1ms</strong></td>
      <td>15.8ms (1.0x)</td>
      <td>81.1ms (5.4x slower)</td>
      <td>72.6ms (4.8x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/6</strong> (400×300)</td>
      <td><strong>15.4ms</strong></td>
      <td>38.2ms (2.5x slower)</td>
      <td>83.7ms (5.4x slower)</td>
      <td>74.4ms (4.8x slower)</td>
    </tr>
    <tr>
      <td><strong>pixelmatch/7</strong> (513×512)</td>
      <td><strong>11.7ms</strong> (odiff)</td>
      <td>11.7ms (1.0x)</td>
      <td>90.6ms (7.7x slower)</td>
      <td>92.2ms (7.9x slower)</td>
    </tr>
    <tr>
      <td><strong>same/1</strong> (1498×1160)</td>
      <td><strong>25.9ms</strong> (odiff)</td>
      <td>25.9ms (1.0x)</td>
      <td>91.1ms (3.5x slower)</td>
      <td>246.7ms (9.5x slower)</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max using hyperfine*

## Pixel By Pixel

### JavaScript (`@blazediff/core` vs `pixelmatch`)

*50 iterations (5 warmup)*

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
      <td>295.88ms</td>
      <td>224.94ms</td>
      <td>70.94ms</td>
      <td>24.0%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>19.76ms</td>
      <td>2.32ms</td>
      <td>17.44ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>295.09ms</td>
      <td>222.20ms</td>
      <td>72.89ms</td>
      <td>24.7%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>21.74ms</td>
      <td>2.64ms</td>
      <td>19.10ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>372.94ms</td>
      <td>281.28ms</td>
      <td>91.66ms</td>
      <td>24.6%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>26.10ms</td>
      <td>3.23ms</td>
      <td>22.87ms</td>
      <td>87.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.53ms</td>
      <td>0.66ms</td>
      <td>1.87ms</td>
      <td>73.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.47ms</td>
      <td>0.04ms</td>
      <td>0.43ms</td>
      <td>90.7%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.67ms</td>
      <td>1.04ms</td>
      <td>1.63ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.39ms</td>
      <td>0.04ms</td>
      <td>0.35ms</td>
      <td>90.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>14.57ms</td>
      <td>9.50ms</td>
      <td>5.06ms</td>
      <td>34.8%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.80ms</td>
      <td>0.19ms</td>
      <td>1.61ms</td>
      <td>89.3%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>321.20ms</td>
      <td>91.74ms</td>
      <td>229.46ms</td>
      <td>71.4%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>64.25ms</td>
      <td>7.83ms</td>
      <td>56.42ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>416.32ms</td>
      <td>276.19ms</td>
      <td>140.13ms</td>
      <td>33.7%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>45.37ms</td>
      <td>5.68ms</td>
      <td>39.68ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.86ms</td>
      <td>0.38ms</td>
      <td>0.47ms</td>
      <td>55.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.14ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.11ms</td>
      <td>1.86ms</td>
      <td>0.25ms</td>
      <td>11.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.77ms</td>
      <td>0.25ms</td>
      <td>0.51ms</td>
      <td>66.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.14ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.07ms</td>
      <td>3.43ms</td>
      <td>0.64ms</td>
      <td>15.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.20ms</td>
      <td>0.02ms</td>
      <td>0.18ms</td>
      <td>90.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.38ms</td>
      <td>0.12ms</td>
      <td>0.26ms</td>
      <td>68.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.92ms</td>
      <td>0.72ms</td>
      <td>0.20ms</td>
      <td>21.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>87.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.90ms</td>
      <td>1.04ms</td>
      <td>0.86ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.28ms</td>
      <td>0.03ms</td>
      <td>0.25ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>1.92ms</td>
      <td>0.26ms</td>
      <td>1.65ms</td>
      <td>86.3%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.89ms</td>
      <td>0.21ms</td>
      <td>1.68ms</td>
      <td>88.8%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

### CLI (`@blazediff/cli` with `@blazediff/sharp-transformer` vs `pixelmatch`)

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
./node_modules/.bin/blazediff-cli ./fixtures/4k/1a.png ./fixtures/4k/1b.png --transformer sharp
  Time (mean ± σ):     573.2 ms ±  17.1 ms    [User: 760.6 ms, System: 58.3 ms]
  Range (min … max):   557.2 ms … 628.6 ms    25 runs

./node_modules/.bin/blazediff-cli ./fixtures/4k/2a.png ./fixtures/4k/2b.png --transformer sharp
  Time (mean ± σ):     647.4 ms ±  23.8 ms    [User: 904.6 ms, System: 66.1 ms]
  Range (min … max):   628.0 ms … 720.6 ms    25 runs

./node_modules/.bin/blazediff-cli ./fixtures/4k/3a.png ./fixtures/4k/3b.png --transformer sharp
  Time (mean ± σ):     714.3 ms ±  17.2 ms    [User: 985.0 ms, System: 69.7 ms]
  Range (min … max):   701.3 ms … 778.8 ms    25 runs

./node_modules/.bin/blazediff-cli ./fixtures/page/1a.png ./fixtures/page/1b.png --transformer sharp
  Time (mean ± σ):     519.2 ms ±  25.5 ms    [User: 750.5 ms, System: 108.8 ms]
  Range (min … max):   489.1 ms … 570.9 ms    25 runs

./node_modules/.bin/blazediff-cli ./fixtures/page/2a.png ./fixtures/page/2b.png --transformer sharp
  Time (mean ± σ):     540.9 ms ±  14.1 ms    [User: 600.7 ms, System: 89.2 ms]
  Range (min … max):   525.3 ms … 593.2 ms    25 runs
```

</td>
</tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

## SSIM

### Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm)

*25 iterations (3 warmup)*

> **~25%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">ssim.js</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blazediff/1</td>
      <td>86.51ms</td>
      <td>64.26ms</td>
      <td>22.25ms</td>
      <td>25.7%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>86.16ms</td>
      <td>64.35ms</td>
      <td>21.81ms</td>
      <td>25.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>34.69ms</td>
      <td>22.91ms</td>
      <td>11.78ms</td>
      <td>34.0%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>34.76ms</td>
      <td>22.64ms</td>
      <td>12.12ms</td>
      <td>34.9%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>99.29ms</td>
      <td>93.73ms</td>
      <td>5.55ms</td>
      <td>5.6%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>99.03ms</td>
      <td>93.47ms</td>
      <td>5.56ms</td>
      <td>5.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>25.35ms</td>
      <td>19.43ms</td>
      <td>5.92ms</td>
      <td>23.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>25.72ms</td>
      <td>19.31ms</td>
      <td>6.41ms</td>
      <td>24.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>12.90ms</td>
      <td>9.57ms</td>
      <td>3.34ms</td>
      <td>25.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>13.08ms</td>
      <td>9.69ms</td>
      <td>3.40ms</td>
      <td>26.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>25.53ms</td>
      <td>19.37ms</td>
      <td>6.16ms</td>
      <td>24.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>25.28ms</td>
      <td>19.37ms</td>
      <td>5.91ms</td>
      <td>23.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>18.44ms</td>
      <td>11.52ms</td>
      <td>6.93ms</td>
      <td>37.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>18.37ms</td>
      <td>11.59ms</td>
      <td>6.78ms</td>
      <td>36.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>13.42ms</td>
      <td>9.72ms</td>
      <td>3.70ms</td>
      <td>27.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>13.08ms</td>
      <td>9.49ms</td>
      <td>3.59ms</td>
      <td>27.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>12.90ms</td>
      <td>9.68ms</td>
      <td>3.22ms</td>
      <td>24.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>13.02ms</td>
      <td>9.58ms</td>
      <td>3.45ms</td>
      <td>26.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>24.89ms</td>
      <td>16.07ms</td>
      <td>8.82ms</td>
      <td>35.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>24.87ms</td>
      <td>16.12ms</td>
      <td>8.75ms</td>
      <td>35.2%</td>
    </tr>
  </tbody>
</table>

### Optimized (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm)

*25 iterations (3 warmup)*

> **~70%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">ssim.js</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blazediff/1</td>
      <td>74.37ms</td>
      <td>12.33ms</td>
      <td>62.04ms</td>
      <td>83.4%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>74.80ms</td>
      <td>12.59ms</td>
      <td>62.21ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>34.76ms</td>
      <td>9.95ms</td>
      <td>24.80ms</td>
      <td>71.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>34.41ms</td>
      <td>10.00ms</td>
      <td>24.41ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>128.50ms</td>
      <td>46.36ms</td>
      <td>82.14ms</td>
      <td>63.9%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>124.50ms</td>
      <td>45.99ms</td>
      <td>78.51ms</td>
      <td>63.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>22.32ms</td>
      <td>3.77ms</td>
      <td>18.55ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>22.56ms</td>
      <td>3.79ms</td>
      <td>18.77ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>11.71ms</td>
      <td>1.87ms</td>
      <td>9.85ms</td>
      <td>84.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>11.04ms</td>
      <td>1.82ms</td>
      <td>9.21ms</td>
      <td>83.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>22.89ms</td>
      <td>3.82ms</td>
      <td>19.07ms</td>
      <td>83.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>22.55ms</td>
      <td>3.78ms</td>
      <td>18.77ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>19.41ms</td>
      <td>5.36ms</td>
      <td>14.05ms</td>
      <td>72.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>19.34ms</td>
      <td>5.18ms</td>
      <td>14.16ms</td>
      <td>73.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>11.22ms</td>
      <td>1.87ms</td>
      <td>9.35ms</td>
      <td>83.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>11.03ms</td>
      <td>1.92ms</td>
      <td>9.10ms</td>
      <td>82.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>11.99ms</td>
      <td>1.95ms</td>
      <td>10.04ms</td>
      <td>83.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>11.21ms</td>
      <td>1.90ms</td>
      <td>9.31ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>24.27ms</td>
      <td>7.23ms</td>
      <td>17.04ms</td>
      <td>70.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>24.61ms</td>
      <td>7.17ms</td>
      <td>17.44ms</td>
      <td>70.9%</td>
    </tr>
  </tbody>
</table>

*Benchmarks run on MacBook Pro M1 Max, Node.js 22*

## Object (`@blazediff/object` vs `microdiff`)

*10000 iterations (50 warmup)*

> **~55%** performance improvement on average.
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
      <td>complex object</td>
      <td>0.0040ms</td>
      <td>0.0015ms</td>
      <td>0.0025ms</td>
      <td>63.0%</td>
    </tr>
    <tr>
      <td>deep nested</td>
      <td>0.0021ms</td>
      <td>0.0010ms</td>
      <td>0.0011ms</td>
      <td>52.0%</td>
    </tr>
    <tr>
      <td>large array</td>
      <td>0.5859ms</td>
      <td>0.2391ms</td>
      <td>0.3468ms</td>
      <td>59.2%</td>
    </tr>
    <tr>
      <td>large identical arrays</td>
      <td>0.0919ms</td>
      <td>0.0031ms</td>
      <td>0.0888ms</td>
      <td>96.6%</td>
    </tr>
    <tr>
      <td>large nested object</td>
      <td>3.3318ms</td>
      <td>1.4536ms</td>
      <td>1.8783ms</td>
      <td>56.4%</td>
    </tr>
    <tr>
      <td>nested object</td>
      <td>0.0031ms</td>
      <td>0.0013ms</td>
      <td>0.0019ms</td>
      <td>59.3%</td>
    </tr>
    <tr>
      <td>simple object</td>
      <td>0.0003ms</td>
      <td>0.0002ms</td>
      <td>0.0002ms</td>
      <td>54.2%</td>
    </tr>
    <tr>
      <td>simple object</td>
      <td>0.0003ms</td>
      <td>0.0002ms</td>
      <td>0.0001ms</td>
      <td>41.3%</td>
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
