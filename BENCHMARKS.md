# BlazeDiff Benchmarks

Performance benchmarks comparing BlazeDiff ecosystem components against popular alternatives.

## Table of Contents

- [BlazeDiff Benchmarks](#blazediff-benchmarks)
  - [Table of Contents](#table-of-contents)
  - [Native Binary (`@blazediff/bin` vs `odiff`) (image IO included)](#native-binary-blazediffbin-vs-odiff-image-io-included)
  - [Pixel By Pixel](#pixel-by-pixel)
    - [JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)](#javascript-blazediffcore-vs-pixelmatch-image-io-excluded)
  - [SSIM](#ssim)
    - [Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm) (image IO excluded)](#fast-original--blazediffssim-using-ssim-vs-ssimjs-using-fast-algorithm-image-io-excluded)
    - [Hitchhikers SSIM SSIM (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm) (image IO excluded)](#hitchhikers-ssim-ssim-blazediffssim-using-hitchhikers-ssim-vs-ssimjs-using-weber-algorithm-image-io-excluded)
  - [Object (`@blazediff/object` vs `microdiff`)](#object-blazediffobject-vs-microdiff)
  - [GitHub Actions](#github-actions)
  - [Test Fixtures](#test-fixtures)
    - [Image Fixtures](#image-fixtures)
    - [Object Fixtures](#object-fixtures)
  - [Hardware Specifications](#hardware-specifications)

## Native Binary (`@blazediff/bin` vs `odiff`) (image IO included)

_25 runs (5 warmup)_

> **3-4x faster than odiff** on 4K images.
> **~50%** performance improvement on average.

The native Rust binary with SIMD optimization is the fastest single-threaded image diff in the world.

<table>
    <tr>
        <td width="500">Benchmark</td>
        <td width="500">ODiff</td>
        <td width="500">BlazeDiff</td>
        <td width="500">Time Saved</td>
        <td width="500">% Improvement</td>
    </tr>
    <tr>
        <td>4k/1</td>
        <td>1190.92ms</td>
        <td>293.86ms</td>
        <td>897.06ms</td>
        <td>75.3%</td>
    </tr>
    <tr>
        <td>4k/1 (identical)</td>
        <td>273.40ms</td>
        <td>215.40ms</td>
        <td>58.00ms</td>
        <td>21.2%</td>
    </tr>
    <tr>
        <td>4k/2</td>
        <td>1530.21ms</td>
        <td>363.50ms</td>
        <td>1166.70ms</td>
        <td>76.2%</td>
    </tr>
    <tr>
        <td>4k/2 (identical)</td>
        <td>346.58ms</td>
        <td>259.08ms</td>
        <td>87.50ms</td>
        <td>25.2%</td>
    </tr>
    <tr>
        <td>4k/3</td>
        <td>1835.47ms</td>
        <td>389.67ms</td>
        <td>1445.79ms</td>
        <td>78.8%</td>
    </tr>
    <tr>
        <td>4k/3 (identical)</td>
        <td>435.21ms</td>
        <td>272.26ms</td>
        <td>162.95ms</td>
        <td>37.4%</td>
    </tr>
    <tr>
        <td>blazediff/1</td>
        <td>5.08ms</td>
        <td>1.92ms</td>
        <td>3.16ms</td>
        <td>62.2%</td>
    </tr>
    <tr>
        <td>blazediff/1 (identical)</td>
        <td>1.57ms</td>
        <td>1.17ms</td>
        <td>0.39ms</td>
        <td>25.2%</td>
    </tr>
    <tr>
        <td>blazediff/2</td>
        <td>3.53ms</td>
        <td>2.13ms</td>
        <td>1.40ms</td>
        <td>39.7%</td>
    </tr>
    <tr>
        <td>blazediff/2 (identical)</td>
        <td>1.44ms</td>
        <td>1.31ms</td>
        <td>0.13ms</td>
        <td>8.9%</td>
    </tr>
    <tr>
        <td>blazediff/3</td>
        <td>51.35ms</td>
        <td>24.93ms</td>
        <td>26.42ms</td>
        <td>51.5%</td>
    </tr>
    <tr>
        <td>blazediff/3 (identical)</td>
        <td>20.71ms</td>
        <td>16.07ms</td>
        <td>4.65ms</td>
        <td>22.4%</td>
    </tr>
    <tr>
        <td>page/1</td>
        <td>1035.20ms</td>
        <td>472.99ms</td>
        <td>562.20ms</td>
        <td>54.3%</td>
    </tr>
    <tr>
        <td>page/1 (identical)</td>
        <td>511.07ms</td>
        <td>289.93ms</td>
        <td>221.14ms</td>
        <td>43.3%</td>
    </tr>
    <tr>
        <td>page/2</td>
        <td>598.79ms</td>
        <td>263.90ms</td>
        <td>334.89ms</td>
        <td>55.9%</td>
    </tr>
    <tr>
        <td>page/2 (identical)</td>
        <td>107.73ms</td>
        <td>80.12ms</td>
        <td>27.60ms</td>
        <td>25.6%</td>
    </tr>
    <tr>
        <td>pixelmatch/1</td>
        <td>3.14ms</td>
        <td>2.73ms</td>
        <td>0.40ms</td>
        <td>12.8%</td>
    </tr>
    <tr>
        <td>pixelmatch/1 (identical)</td>
        <td>1.72ms</td>
        <td>1.00ms</td>
        <td>0.72ms</td>
        <td>42.0%</td>
    </tr>
    <tr>
        <td>pixelmatch/2</td>
        <td>3.42ms</td>
        <td>1.71ms</td>
        <td>1.71ms</td>
        <td>49.9%</td>
    </tr>
    <tr>
        <td>pixelmatch/2 (identical)</td>
        <td>0.48ms</td>
        <td>0.50ms</td>
        <td>-0.02ms</td>
        <td>-3.1%</td>
    </tr>
    <tr>
        <td>pixelmatch/3</td>
        <td>2.42ms</td>
        <td>1.12ms</td>
        <td>1.31ms</td>
        <td>54.0%</td>
    </tr>
    <tr>
        <td>pixelmatch/3 (identical)</td>
        <td>1.71ms</td>
        <td>0.78ms</td>
        <td>0.93ms</td>
        <td>54.4%</td>
    </tr>
    <tr>
        <td>pixelmatch/4</td>
        <td>9.24ms</td>
        <td>4.85ms</td>
        <td>4.39ms</td>
        <td>47.5%</td>
    </tr>
    <tr>
        <td>pixelmatch/4 (identical)</td>
        <td>3.36ms</td>
        <td>2.21ms</td>
        <td>1.15ms</td>
        <td>34.2%</td>
    </tr>
    <tr>
        <td>pixelmatch/5</td>
        <td>0.85ms</td>
        <td>0.59ms</td>
        <td>0.26ms</td>
        <td>30.8%</td>
    </tr>
    <tr>
        <td>pixelmatch/5 (identical)</td>
        <td>0.79ms</td>
        <td>0.53ms</td>
        <td>0.26ms</td>
        <td>32.7%</td>
    </tr>
    <tr>
        <td>pixelmatch/6</td>
        <td>5.52ms</td>
        <td>1.61ms</td>
        <td>3.91ms</td>
        <td>70.9%</td>
    </tr>
    <tr>
        <td>pixelmatch/6 (identical)</td>
        <td>1.12ms</td>
        <td>0.78ms</td>
        <td>0.34ms</td>
        <td>30.2%</td>
    </tr>
    <tr>
        <td>pixelmatch/7</td>
        <td>3.29ms</td>
        <td>1.61ms</td>
        <td>1.68ms</td>
        <td>51.0%</td>
    </tr>
    <tr>
        <td>pixelmatch/7 (identical)</td>
        <td>0.72ms</td>
        <td>0.71ms</td>
        <td>0.01ms</td>
        <td>1.8%</td>
    </tr>
    <tr>
        <td>same/1</td>
        <td>5.50ms</td>
        <td>4.70ms</td>
        <td>0.80ms</td>
        <td>14.6%</td>
    </tr>
    <tr>
        <td>same/1 (identical)</td>
        <td>10.71ms</td>
        <td>4.66ms</td>
        <td>6.05ms</td>
        <td>56.5%</td>
    </tr>
</table>

_Benchmarks run on MacBook Pro M1 Max using hyperfine_

## Pixel By Pixel

### JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~82%** performance improvement on average

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
      <td>302.29ms</td>
      <td>211.92ms</td>
      <td>90.37ms</td>
      <td>29.9%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>19.18ms</td>
      <td>2.39ms</td>
      <td>16.79ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>300.89ms</td>
      <td>215.40ms</td>
      <td>85.49ms</td>
      <td>28.4%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>21.39ms</td>
      <td>2.61ms</td>
      <td>18.79ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>378.13ms</td>
      <td>263.82ms</td>
      <td>114.31ms</td>
      <td>30.2%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>25.67ms</td>
      <td>3.20ms</td>
      <td>22.48ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.57ms</td>
      <td>0.68ms</td>
      <td>1.89ms</td>
      <td>73.7%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.46ms</td>
      <td>0.05ms</td>
      <td>0.41ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.69ms</td>
      <td>1.12ms</td>
      <td>1.57ms</td>
      <td>58.3%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.38ms</td>
      <td>0.04ms</td>
      <td>0.35ms</td>
      <td>90.4%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>14.87ms</td>
      <td>9.01ms</td>
      <td>5.85ms</td>
      <td>39.4%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.75ms</td>
      <td>0.20ms</td>
      <td>1.56ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>331.94ms</td>
      <td>92.77ms</td>
      <td>239.17ms</td>
      <td>72.1%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>63.18ms</td>
      <td>7.68ms</td>
      <td>55.50ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>421.89ms</td>
      <td>306.72ms</td>
      <td>115.18ms</td>
      <td>27.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>44.76ms</td>
      <td>5.37ms</td>
      <td>39.39ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.87ms</td>
      <td>0.39ms</td>
      <td>0.48ms</td>
      <td>55.0%</td>
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
      <td>2.12ms</td>
      <td>2.18ms</td>
      <td>-0.06ms</td>
      <td>-2.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.78ms</td>
      <td>0.26ms</td>
      <td>0.53ms</td>
      <td>67.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.14ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.20ms</td>
      <td>3.93ms</td>
      <td>0.27ms</td>
      <td>6.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.19ms</td>
      <td>0.02ms</td>
      <td>0.17ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.39ms</td>
      <td>0.13ms</td>
      <td>0.26ms</td>
      <td>67.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.94ms</td>
      <td>0.80ms</td>
      <td>0.14ms</td>
      <td>15.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.92ms</td>
      <td>0.98ms</td>
      <td>0.94ms</td>
      <td>48.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.27ms</td>
      <td>0.03ms</td>
      <td>0.24ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>1.89ms</td>
      <td>0.21ms</td>
      <td>1.68ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.86ms</td>
      <td>0.21ms</td>
      <td>1.65ms</td>
      <td>88.8%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## SSIM

### Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm) (image IO excluded)

_25 iterations (3 warmup)_

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

### Hitchhikers SSIM SSIM (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm) (image IO excluded)

_25 iterations (3 warmup)_

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

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## Object (`@blazediff/object` vs `microdiff`)

_10000 iterations (50 warmup)_

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

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## GitHub Actions

Automated benchmarks run on every commit:

- [benchmark.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-algorithm.yml) - Core algorithm benchmarks
- [benchmark-object.yml](https://github.com/teimurjan/blazediff/actions/workflows/benchmark-object.yml) - Object diffing benchmarks

## Test Fixtures

### Image Fixtures

The image benchmark fixtures used for testing are documented in the [fixtures README](./fixtures/README.md).

### Object Fixtures

The object benchmark fixtures can be viewed [here](./apps/object-benchmark/src/fixtures.ts).

## Hardware Specifications

All benchmarks are run on consistent hardware:

- **CPU**: Apple M1 Max
- **Runtime**: Node.js 22
- **OS**: macOS
