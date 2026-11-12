# Pixel By Pixel Benchmarks

Comparisons that compare pixels directly (RGBA or YIQ perceptual delta). Image decode is excluded except where the section title explicitly says "image IO included" (native binary, Python bindings).

## JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~73.4%** performance improvement on average.

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
      <td>331.37ms</td>
      <td>46.99ms</td>
      <td>284.38ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>17.91ms</td>
      <td>5.02ms</td>
      <td>12.88ms</td>
      <td>71.9%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>320.77ms</td>
      <td>69.31ms</td>
      <td>251.47ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>21.26ms</td>
      <td>5.72ms</td>
      <td>15.54ms</td>
      <td>73.1%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>405.66ms</td>
      <td>60.99ms</td>
      <td>344.68ms</td>
      <td>85.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>25.40ms</td>
      <td>7.71ms</td>
      <td>17.69ms</td>
      <td>69.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.33ms</td>
      <td>0.21ms</td>
      <td>1.12ms</td>
      <td>84.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.39ms</td>
      <td>0.10ms</td>
      <td>0.29ms</td>
      <td>73.6%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.81ms</td>
      <td>0.60ms</td>
      <td>1.21ms</td>
      <td>66.8%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.33ms</td>
      <td>0.07ms</td>
      <td>0.26ms</td>
      <td>78.5%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>11.76ms</td>
      <td>5.12ms</td>
      <td>6.64ms</td>
      <td>56.4%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.53ms</td>
      <td>0.40ms</td>
      <td>1.13ms</td>
      <td>74.0%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>13.30ms</td>
      <td>2.97ms</td>
      <td>10.33ms</td>
      <td>77.7%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>3.51ms</td>
      <td>0.94ms</td>
      <td>2.57ms</td>
      <td>73.2%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>167.38ms</td>
      <td>32.11ms</td>
      <td>135.27ms</td>
      <td>80.8%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>66.47ms</td>
      <td>24.98ms</td>
      <td>41.50ms</td>
      <td>62.4%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>491.59ms</td>
      <td>84.76ms</td>
      <td>406.83ms</td>
      <td>82.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>46.54ms</td>
      <td>17.33ms</td>
      <td>29.21ms</td>
      <td>62.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.61ms</td>
      <td>0.17ms</td>
      <td>0.44ms</td>
      <td>72.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.13ms</td>
      <td>0.01ms</td>
      <td>0.11ms</td>
      <td>90.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.37ms</td>
      <td>1.14ms</td>
      <td>1.23ms</td>
      <td>51.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.06ms</td>
      <td>0.00ms</td>
      <td>0.06ms</td>
      <td>93.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.41ms</td>
      <td>0.13ms</td>
      <td>0.28ms</td>
      <td>68.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.12ms</td>
      <td>0.01ms</td>
      <td>0.11ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.61ms</td>
      <td>2.37ms</td>
      <td>2.24ms</td>
      <td>48.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.17ms</td>
      <td>0.01ms</td>
      <td>0.16ms</td>
      <td>92.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.22ms</td>
      <td>0.13ms</td>
      <td>0.09ms</td>
      <td>41.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.06ms</td>
      <td>0.00ms</td>
      <td>0.06ms</td>
      <td>92.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.88ms</td>
      <td>0.57ms</td>
      <td>0.31ms</td>
      <td>35.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.06ms</td>
      <td>0.00ms</td>
      <td>0.06ms</td>
      <td>92.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.36ms</td>
      <td>0.60ms</td>
      <td>0.76ms</td>
      <td>56.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.23ms</td>
      <td>0.03ms</td>
      <td>0.20ms</td>
      <td>87.2%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>1.62ms</td>
      <td>0.43ms</td>
      <td>1.19ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.62ms</td>
      <td>0.43ms</td>
      <td>1.19ms</td>
      <td>73.4%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~46.4%** performance improvement on average.

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
      <td>413.23ms</td>
      <td>123.57ms</td>
      <td>289.67ms</td>
      <td>70.1%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>90.52ms</td>
      <td>79.34ms</td>
      <td>11.18ms</td>
      <td>12.4%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>413.18ms</td>
      <td>148.51ms</td>
      <td>264.68ms</td>
      <td>64.1%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>101.10ms</td>
      <td>81.02ms</td>
      <td>20.08ms</td>
      <td>19.9%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>513.47ms</td>
      <td>161.68ms</td>
      <td>351.79ms</td>
      <td>68.5%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>122.07ms</td>
      <td>106.75ms</td>
      <td>15.32ms</td>
      <td>12.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>3.31ms</td>
      <td>1.09ms</td>
      <td>2.22ms</td>
      <td>67.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>2.04ms</td>
      <td>0.99ms</td>
      <td>1.04ms</td>
      <td>51.2%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>3.45ms</td>
      <td>1.10ms</td>
      <td>2.35ms</td>
      <td>68.2%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.67ms</td>
      <td>0.52ms</td>
      <td>1.15ms</td>
      <td>69.1%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>19.27ms</td>
      <td>11.31ms</td>
      <td>7.96ms</td>
      <td>41.3%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>7.78ms</td>
      <td>6.11ms</td>
      <td>1.66ms</td>
      <td>21.4%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>31.38ms</td>
      <td>5.83ms</td>
      <td>25.55ms</td>
      <td>81.4%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>18.04ms</td>
      <td>4.03ms</td>
      <td>14.01ms</td>
      <td>77.6%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>445.70ms</td>
      <td>173.91ms</td>
      <td>271.79ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>302.01ms</td>
      <td>172.86ms</td>
      <td>129.15ms</td>
      <td>42.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>690.41ms</td>
      <td>181.96ms</td>
      <td>508.45ms</td>
      <td>73.6%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>213.00ms</td>
      <td>113.18ms</td>
      <td>99.82ms</td>
      <td>46.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>1.21ms</td>
      <td>0.38ms</td>
      <td>0.83ms</td>
      <td>68.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.62ms</td>
      <td>0.22ms</td>
      <td>0.40ms</td>
      <td>64.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.65ms</td>
      <td>1.46ms</td>
      <td>1.18ms</td>
      <td>44.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.31ms</td>
      <td>0.24ms</td>
      <td>0.07ms</td>
      <td>23.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>1.03ms</td>
      <td>0.33ms</td>
      <td>0.70ms</td>
      <td>67.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.62ms</td>
      <td>0.20ms</td>
      <td>0.42ms</td>
      <td>67.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>5.39ms</td>
      <td>3.08ms</td>
      <td>2.31ms</td>
      <td>42.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.86ms</td>
      <td>0.67ms</td>
      <td>0.19ms</td>
      <td>22.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.52ms</td>
      <td>0.59ms</td>
      <td>-0.07ms</td>
      <td>-12.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.31ms</td>
      <td>0.46ms</td>
      <td>-0.15ms</td>
      <td>-48.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>1.16ms</td>
      <td>0.83ms</td>
      <td>0.33ms</td>
      <td>28.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.31ms</td>
      <td>0.25ms</td>
      <td>0.07ms</td>
      <td>20.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>2.51ms</td>
      <td>1.25ms</td>
      <td>1.25ms</td>
      <td>50.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.19ms</td>
      <td>0.66ms</td>
      <td>0.53ms</td>
      <td>44.5%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>8.28ms</td>
      <td>2.34ms</td>
      <td>5.94ms</td>
      <td>71.8%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>8.27ms</td>
      <td>2.34ms</td>
      <td>5.94ms</td>
      <td>71.8%</td>
    </tr>
  </tbody>
</table>

## WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)

_25 iterations (5 warmup)_

> **~67.8%** performance improvement on average.

The WebAssembly build of BlazeDiff uses the same Rust algorithm as the native binary, compiled to `wasm32` with `v128` SIMD (`+simd128`). Counts agree with `pixelmatch` to within ~0.05% across the fixture set (e.g. `pixelmatch/1`: identical 106 vs 106; `blazediff/3`: 22 869 vs 22 883 out of 1 630 784 pixels; `4k/1`: 69 932 vs 69 912 out of 17 920 000): both use a YIQ-style perceptual delta, so they classify the same pixels modulo a handful of edge cases.

Byte-identical pairs used to be the one case where `pixelmatch` won. The cause was the
decoded-equality shortcut: on `wasm32-unknown-unknown` there is no libc, so Rust's
`Vec<u8> == Vec<u8>` lowered to `compiler_builtins`' scalar byte-loop memcmp, measured at
~2.4 GB/s: about 30ms for a 4K pair, which on its own costs more than running the whole
SIMD diff over that pair. The shortcut is now skipped on wasm (the cold block-scan reaches
the same conclusion with v128 compares), which roughly halved `4k/1 (identical)`, from
~33ms to the 17.47ms in the table below, and turned every `(identical)` row from a
~60-70% loss into a win.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Pixelmatch</th>
      <th width="500">BlazeDiff (core-wasm)</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>327.33ms</td>
      <td>57.49ms</td>
      <td>269.84ms</td>
      <td>82.4%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>18.32ms</td>
      <td>5.08ms</td>
      <td>13.24ms</td>
      <td>72.3%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>324.63ms</td>
      <td>98.97ms</td>
      <td>225.66ms</td>
      <td>69.5%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>20.78ms</td>
      <td>6.18ms</td>
      <td>14.61ms</td>
      <td>70.3%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>422.67ms</td>
      <td>81.60ms</td>
      <td>341.07ms</td>
      <td>80.7%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>25.77ms</td>
      <td>7.97ms</td>
      <td>17.79ms</td>
      <td>69.1%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.39ms</td>
      <td>0.42ms</td>
      <td>0.97ms</td>
      <td>70.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.40ms</td>
      <td>0.10ms</td>
      <td>0.31ms</td>
      <td>76.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.93ms</td>
      <td>0.83ms</td>
      <td>1.10ms</td>
      <td>56.8%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.35ms</td>
      <td>0.07ms</td>
      <td>0.27ms</td>
      <td>78.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>11.90ms</td>
      <td>7.73ms</td>
      <td>4.16ms</td>
      <td>35.0%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.57ms</td>
      <td>0.41ms</td>
      <td>1.16ms</td>
      <td>73.9%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>13.12ms</td>
      <td>5.25ms</td>
      <td>7.87ms</td>
      <td>60.0%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>3.70ms</td>
      <td>0.97ms</td>
      <td>2.73ms</td>
      <td>73.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>174.92ms</td>
      <td>74.92ms</td>
      <td>100.00ms</td>
      <td>57.2%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>66.58ms</td>
      <td>25.73ms</td>
      <td>40.84ms</td>
      <td>61.3%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>498.86ms</td>
      <td>119.82ms</td>
      <td>379.04ms</td>
      <td>76.0%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>47.67ms</td>
      <td>18.13ms</td>
      <td>29.54ms</td>
      <td>62.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.68ms</td>
      <td>0.12ms</td>
      <td>0.55ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.12ms</td>
      <td>0.01ms</td>
      <td>0.11ms</td>
      <td>91.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.40ms</td>
      <td>1.96ms</td>
      <td>0.44ms</td>
      <td>18.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.06ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>90.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.45ms</td>
      <td>0.13ms</td>
      <td>0.32ms</td>
      <td>71.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.12ms</td>
      <td>0.01ms</td>
      <td>0.11ms</td>
      <td>91.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.73ms</td>
      <td>3.90ms</td>
      <td>0.83ms</td>
      <td>17.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.17ms</td>
      <td>0.01ms</td>
      <td>0.15ms</td>
      <td>91.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.23ms</td>
      <td>0.06ms</td>
      <td>0.17ms</td>
      <td>73.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.06ms</td>
      <td>0.01ms</td>
      <td>0.05ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.86ms</td>
      <td>0.85ms</td>
      <td>0.00ms</td>
      <td>0.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>91.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.44ms</td>
      <td>0.87ms</td>
      <td>0.57ms</td>
      <td>39.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.25ms</td>
      <td>0.04ms</td>
      <td>0.21ms</td>
      <td>85.7%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>1.71ms</td>
      <td>0.45ms</td>
      <td>1.27ms</td>
      <td>74.0%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.72ms</td>
      <td>0.44ms</td>
      <td>1.28ms</td>
      <td>74.4%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) (image IO included)

_25 runs (5 warmup)_

> **4.3-4.9x faster than odiff** on 4K images (6.5-7.2x with `BLAZEDIFF_PNG_ENABLED=1`).
> **~18.3%** performance improvement on average.

The native Rust binary with SIMD optimization is the fastest single-threaded image diff in the world.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">ODiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">BlazeDiff Next</th>
      <th width="500">BlazeDiff Saved</th>
      <th width="500">BlazeDiff %</th>
      <th width="500">BlazeDiff Next Saved</th>
      <th width="500">BlazeDiff Next %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>1556.49ms</td>
      <td>462.94ms</td>
      <td>336.10ms</td>
      <td>1093.54ms</td>
      <td>70.3%</td>
      <td>1220.39ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>300.16ms</td>
      <td>263.04ms</td>
      <td>198.59ms</td>
      <td>37.13ms</td>
      <td>12.4%</td>
      <td>101.58ms</td>
      <td>33.8%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1993.49ms</td>
      <td>576.63ms</td>
      <td>426.65ms</td>
      <td>1416.87ms</td>
      <td>71.1%</td>
      <td>1566.85ms</td>
      <td>78.6%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>381.12ms</td>
      <td>354.09ms</td>
      <td>233.87ms</td>
      <td>27.03ms</td>
      <td>7.1%</td>
      <td>147.25ms</td>
      <td>38.6%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>2304.57ms</td>
      <td>676.99ms</td>
      <td>446.34ms</td>
      <td>1627.58ms</td>
      <td>70.6%</td>
      <td>1858.24ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>461.74ms</td>
      <td>352.39ms</td>
      <td>257.79ms</td>
      <td>109.34ms</td>
      <td>23.7%</td>
      <td>203.95ms</td>
      <td>44.2%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.50ms</td>
      <td>2.68ms</td>
      <td>7.27ms</td>
      <td>1.82ms</td>
      <td>40.4%</td>
      <td>-2.77ms</td>
      <td>-61.5%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>2.11ms</td>
      <td>1.14ms</td>
      <td>0.93ms</td>
      <td>0.98ms</td>
      <td>46.2%</td>
      <td>1.18ms</td>
      <td>56.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.62ms</td>
      <td>2.89ms</td>
      <td>3.18ms</td>
      <td>1.73ms</td>
      <td>37.5%</td>
      <td>1.45ms</td>
      <td>31.3%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>2.03ms</td>
      <td>1.08ms</td>
      <td>0.86ms</td>
      <td>0.95ms</td>
      <td>46.7%</td>
      <td>1.18ms</td>
      <td>57.9%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>55.18ms</td>
      <td>28.08ms</td>
      <td>30.98ms</td>
      <td>27.10ms</td>
      <td>49.1%</td>
      <td>24.20ms</td>
      <td>43.9%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>22.23ms</td>
      <td>18.13ms</td>
      <td>11.33ms</td>
      <td>4.10ms</td>
      <td>18.4%</td>
      <td>10.91ms</td>
      <td>49.1%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>27.15ms</td>
      <td>60.91ms</td>
      <td>66.01ms</td>
      <td>-33.76ms</td>
      <td>-124.3%</td>
      <td>-38.86ms</td>
      <td>-143.1%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>9.90ms</td>
      <td>5.19ms</td>
      <td>5.24ms</td>
      <td>4.72ms</td>
      <td>47.6%</td>
      <td>4.66ms</td>
      <td>47.1%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1098.35ms</td>
      <td>1285.13ms</td>
      <td>1106.77ms</td>
      <td>-186.77ms</td>
      <td>-17.0%</td>
      <td>-8.42ms</td>
      <td>-0.8%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>565.22ms</td>
      <td>362.95ms</td>
      <td>366.16ms</td>
      <td>202.27ms</td>
      <td>35.8%</td>
      <td>199.06ms</td>
      <td>35.2%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>917.37ms</td>
      <td>779.34ms</td>
      <td>740.31ms</td>
      <td>138.03ms</td>
      <td>15.0%</td>
      <td>177.06ms</td>
      <td>19.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>180.16ms</td>
      <td>157.29ms</td>
      <td>142.43ms</td>
      <td>22.86ms</td>
      <td>12.7%</td>
      <td>37.72ms</td>
      <td>20.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>3.55ms</td>
      <td>1.62ms</td>
      <td>15.82ms</td>
      <td>1.93ms</td>
      <td>54.4%</td>
      <td>-12.28ms</td>
      <td>-346.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>1.90ms</td>
      <td>0.95ms</td>
      <td>0.74ms</td>
      <td>0.95ms</td>
      <td>50.2%</td>
      <td>1.16ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>4.19ms</td>
      <td>4.51ms</td>
      <td>1.75ms</td>
      <td>-0.32ms</td>
      <td>-7.7%</td>
      <td>2.43ms</td>
      <td>58.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.74ms</td>
      <td>0.46ms</td>
      <td>0.22ms</td>
      <td>0.27ms</td>
      <td>36.9%</td>
      <td>0.52ms</td>
      <td>70.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.64ms</td>
      <td>1.78ms</td>
      <td>8.73ms</td>
      <td>0.86ms</td>
      <td>32.6%</td>
      <td>-6.09ms</td>
      <td>-230.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>1.69ms</td>
      <td>0.72ms</td>
      <td>0.58ms</td>
      <td>0.97ms</td>
      <td>57.1%</td>
      <td>1.11ms</td>
      <td>65.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>11.81ms</td>
      <td>9.60ms</td>
      <td>4.58ms</td>
      <td>2.21ms</td>
      <td>18.7%</td>
      <td>7.24ms</td>
      <td>61.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>3.40ms</td>
      <td>2.75ms</td>
      <td>1.42ms</td>
      <td>0.65ms</td>
      <td>19.1%</td>
      <td>1.99ms</td>
      <td>58.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.91ms</td>
      <td>1.04ms</td>
      <td>1.02ms</td>
      <td>-0.14ms</td>
      <td>-15.1%</td>
      <td>-0.11ms</td>
      <td>-12.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.88ms</td>
      <td>0.67ms</td>
      <td>0.46ms</td>
      <td>0.21ms</td>
      <td>23.9%</td>
      <td>0.42ms</td>
      <td>48.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>6.78ms</td>
      <td>2.13ms</td>
      <td>3.51ms</td>
      <td>4.66ms</td>
      <td>68.7%</td>
      <td>3.28ms</td>
      <td>48.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.26ms</td>
      <td>0.86ms</td>
      <td>0.52ms</td>
      <td>0.40ms</td>
      <td>31.6%</td>
      <td>0.75ms</td>
      <td>59.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>4.51ms</td>
      <td>19.84ms</td>
      <td>1.73ms</td>
      <td>-15.33ms</td>
      <td>-340.3%</td>
      <td>2.77ms</td>
      <td>61.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.41ms</td>
      <td>0.84ms</td>
      <td>0.48ms</td>
      <td>0.57ms</td>
      <td>40.3%</td>
      <td>0.93ms</td>
      <td>65.9%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>6.01ms</td>
      <td>3.33ms</td>
      <td>2.80ms</td>
      <td>2.68ms</td>
      <td>44.7%</td>
      <td>3.22ms</td>
      <td>53.5%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>5.95ms</td>
      <td>3.31ms</td>
      <td>2.76ms</td>
      <td>2.64ms</td>
      <td>44.4%</td>
      <td>3.19ms</td>
      <td>53.6%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max using hyperfine_

## JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) (image IO included)

_25 runs (5 warmup)_

> **~38.3%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">honeydiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>2286.17ms</td>
      <td>502.57ms</td>
      <td>1783.61ms</td>
      <td>78.0%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>869.69ms</td>
      <td>294.41ms</td>
      <td>575.29ms</td>
      <td>66.1%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>2060.62ms</td>
      <td>629.10ms</td>
      <td>1431.52ms</td>
      <td>69.5%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>1018.50ms</td>
      <td>357.33ms</td>
      <td>661.17ms</td>
      <td>64.9%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1972.25ms</td>
      <td>691.74ms</td>
      <td>1280.51ms</td>
      <td>64.9%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>1188.26ms</td>
      <td>394.23ms</td>
      <td>794.04ms</td>
      <td>66.8%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.82ms</td>
      <td>3.90ms</td>
      <td>0.92ms</td>
      <td>19.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.69ms</td>
      <td>1.09ms</td>
      <td>3.60ms</td>
      <td>76.7%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.54ms</td>
      <td>8.33ms</td>
      <td>-3.79ms</td>
      <td>-83.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>4.02ms</td>
      <td>1.06ms</td>
      <td>2.97ms</td>
      <td>73.7%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>52.15ms</td>
      <td>28.49ms</td>
      <td>23.67ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>46.43ms</td>
      <td>18.11ms</td>
      <td>28.31ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>37.30ms</td>
      <td>78.62ms</td>
      <td>-41.32ms</td>
      <td>-110.8%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>33.26ms</td>
      <td>5.05ms</td>
      <td>28.21ms</td>
      <td>84.8%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1681.14ms</td>
      <td>1347.60ms</td>
      <td>333.54ms</td>
      <td>19.8%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>1681.82ms</td>
      <td>396.05ms</td>
      <td>1285.77ms</td>
      <td>76.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>2688.05ms</td>
      <td>792.69ms</td>
      <td>1895.36ms</td>
      <td>70.5%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>1055.22ms</td>
      <td>167.99ms</td>
      <td>887.22ms</td>
      <td>84.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>5.37ms</td>
      <td>1.54ms</td>
      <td>3.82ms</td>
      <td>71.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>2.48ms</td>
      <td>0.97ms</td>
      <td>1.50ms</td>
      <td>60.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>6.30ms</td>
      <td>2.16ms</td>
      <td>4.15ms</td>
      <td>65.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.81ms</td>
      <td>0.46ms</td>
      <td>1.35ms</td>
      <td>74.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.47ms</td>
      <td>1.42ms</td>
      <td>1.05ms</td>
      <td>42.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.10ms</td>
      <td>0.72ms</td>
      <td>1.38ms</td>
      <td>65.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>14.23ms</td>
      <td>12.04ms</td>
      <td>2.19ms</td>
      <td>15.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>7.02ms</td>
      <td>2.88ms</td>
      <td>4.14ms</td>
      <td>58.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.40ms</td>
      <td>6.22ms</td>
      <td>-4.82ms</td>
      <td>-344.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.34ms</td>
      <td>0.68ms</td>
      <td>0.66ms</td>
      <td>48.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>6.01ms</td>
      <td>2.05ms</td>
      <td>3.95ms</td>
      <td>65.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.94ms</td>
      <td>0.95ms</td>
      <td>0.98ms</td>
      <td>50.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>5.07ms</td>
      <td>7.24ms</td>
      <td>-2.17ms</td>
      <td>-42.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>4.02ms</td>
      <td>0.86ms</td>
      <td>3.16ms</td>
      <td>78.6%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>17.44ms</td>
      <td>3.31ms</td>
      <td>14.13ms</td>
      <td>81.0%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>17.25ms</td>
      <td>3.23ms</td>
      <td>14.02ms</td>
      <td>81.3%</td>
    </tr>
  </tbody>
</table>

## Python Bindings (`blazediff` PyPI via PyO3) (image IO included)

The PyO3-backed `blazediff` PyPI package wraps the same Rust core as the native binary; published as platform-tagged wheels (manylinux / macOS / Windows). Comparisons below use the path-based `compare()` API, so PNG decode is part of the timed region (directly comparable to the Native Binary section above).

### vs `pixelmatch` (pypi)

_25 iterations (5 warmup) for blazediff; 10 iterations (5 warmup) for pixelmatch (pypi)_

> **~80.9%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">pixelmatch (pypi)</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>20204.38ms</td>
      <td>212.62ms</td>
      <td>19991.76ms</td>
      <td>98.9%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>595.85ms</td>
      <td>199.42ms</td>
      <td>396.44ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>23276.66ms</td>
      <td>279.84ms</td>
      <td>22996.82ms</td>
      <td>98.8%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>734.42ms</td>
      <td>241.59ms</td>
      <td>492.83ms</td>
      <td>67.1%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>26298.68ms</td>
      <td>270.35ms</td>
      <td>26028.34ms</td>
      <td>99.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>792.13ms</td>
      <td>249.54ms</td>
      <td>542.59ms</td>
      <td>68.5%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>261.43ms</td>
      <td>1.13ms</td>
      <td>260.30ms</td>
      <td>99.6%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.18ms</td>
      <td>1.03ms</td>
      <td>3.15ms</td>
      <td>75.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>271.18ms</td>
      <td>1.58ms</td>
      <td>269.60ms</td>
      <td>99.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>3.81ms</td>
      <td>1.13ms</td>
      <td>2.68ms</td>
      <td>70.3%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>1503.28ms</td>
      <td>19.03ms</td>
      <td>1484.25ms</td>
      <td>98.7%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>46.32ms</td>
      <td>15.52ms</td>
      <td>30.80ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>2477.67ms</td>
      <td>5.81ms</td>
      <td>2471.86ms</td>
      <td>99.8%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>28.76ms</td>
      <td>4.92ms</td>
      <td>23.85ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>40254.90ms</td>
      <td>285.47ms</td>
      <td>39969.43ms</td>
      <td>99.3%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>871.79ms</td>
      <td>266.49ms</td>
      <td>605.30ms</td>
      <td>69.4%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>42516.84ms</td>
      <td>73.36ms</td>
      <td>42443.47ms</td>
      <td>99.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>178.74ms</td>
      <td>48.83ms</td>
      <td>129.91ms</td>
      <td>72.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>88.66ms</td>
      <td>1.29ms</td>
      <td>87.37ms</td>
      <td>98.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>2.86ms</td>
      <td>1.20ms</td>
      <td>1.66ms</td>
      <td>57.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>179.13ms</td>
      <td>1.58ms</td>
      <td>177.56ms</td>
      <td>99.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.89ms</td>
      <td>0.54ms</td>
      <td>0.36ms</td>
      <td>39.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>86.57ms</td>
      <td>1.05ms</td>
      <td>85.52ms</td>
      <td>98.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.25ms</td>
      <td>1.05ms</td>
      <td>1.19ms</td>
      <td>53.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>376.98ms</td>
      <td>4.53ms</td>
      <td>372.45ms</td>
      <td>98.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>5.69ms</td>
      <td>2.28ms</td>
      <td>3.40ms</td>
      <td>59.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>44.24ms</td>
      <td>0.66ms</td>
      <td>43.58ms</td>
      <td>98.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.13ms</td>
      <td>0.62ms</td>
      <td>0.51ms</td>
      <td>45.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>108.60ms</td>
      <td>1.64ms</td>
      <td>106.95ms</td>
      <td>98.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.59ms</td>
      <td>0.86ms</td>
      <td>0.72ms</td>
      <td>45.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>192.89ms</td>
      <td>1.11ms</td>
      <td>191.78ms</td>
      <td>99.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.53ms</td>
      <td>0.71ms</td>
      <td>0.82ms</td>
      <td>53.5%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>23.42ms</td>
      <td>3.55ms</td>
      <td>19.87ms</td>
      <td>84.8%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>25.54ms</td>
      <td>3.55ms</td>
      <td>21.98ms</td>
      <td>86.1%</td>
    </tr>
  </tbody>
</table>

### vs `opencv-python` (`cv2.absdiff`)

_25 iterations (5 warmup)_

> **~64.7%** performance improvement on average.

OpenCV's `cv2.absdiff` is a grayscale absolute-difference baseline (the snippet from the OpenCV cookbook); blazediff additionally computes a YIQ perceptual delta with anti-aliasing detection, yet still wins on every fixture.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">OpenCV absdiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1</td>
      <td>616.54ms</td>
      <td>212.62ms</td>
      <td>403.92ms</td>
      <td>65.5%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>781.71ms</td>
      <td>199.42ms</td>
      <td>582.30ms</td>
      <td>74.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>709.73ms</td>
      <td>279.84ms</td>
      <td>429.89ms</td>
      <td>60.6%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>694.59ms</td>
      <td>241.59ms</td>
      <td>453.00ms</td>
      <td>65.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>820.47ms</td>
      <td>270.35ms</td>
      <td>550.12ms</td>
      <td>67.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>789.61ms</td>
      <td>249.54ms</td>
      <td>540.08ms</td>
      <td>68.4%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.94ms</td>
      <td>1.13ms</td>
      <td>3.81ms</td>
      <td>77.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.50ms</td>
      <td>1.03ms</td>
      <td>3.47ms</td>
      <td>77.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.14ms</td>
      <td>1.58ms</td>
      <td>2.55ms</td>
      <td>61.7%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>4.01ms</td>
      <td>1.13ms</td>
      <td>2.88ms</td>
      <td>71.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>44.59ms</td>
      <td>19.03ms</td>
      <td>25.56ms</td>
      <td>57.3%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>44.49ms</td>
      <td>15.52ms</td>
      <td>28.96ms</td>
      <td>65.1%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>30.53ms</td>
      <td>5.81ms</td>
      <td>24.72ms</td>
      <td>81.0%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>30.23ms</td>
      <td>4.92ms</td>
      <td>25.32ms</td>
      <td>83.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1063.19ms</td>
      <td>285.47ms</td>
      <td>777.73ms</td>
      <td>73.1%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>1205.75ms</td>
      <td>266.49ms</td>
      <td>939.25ms</td>
      <td>77.9%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>305.51ms</td>
      <td>73.36ms</td>
      <td>232.14ms</td>
      <td>76.0%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>288.35ms</td>
      <td>48.83ms</td>
      <td>239.52ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>3.46ms</td>
      <td>1.29ms</td>
      <td>2.17ms</td>
      <td>62.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>4.40ms</td>
      <td>1.20ms</td>
      <td>3.20ms</td>
      <td>72.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>1.16ms</td>
      <td>1.58ms</td>
      <td>-0.42ms</td>
      <td>-36.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.07ms</td>
      <td>0.54ms</td>
      <td>0.53ms</td>
      <td>50.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>3.40ms</td>
      <td>1.05ms</td>
      <td>2.35ms</td>
      <td>69.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>3.96ms</td>
      <td>1.05ms</td>
      <td>2.91ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>7.76ms</td>
      <td>4.53ms</td>
      <td>3.23ms</td>
      <td>41.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>6.00ms</td>
      <td>2.28ms</td>
      <td>3.71ms</td>
      <td>61.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.84ms</td>
      <td>0.66ms</td>
      <td>1.18ms</td>
      <td>64.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.89ms</td>
      <td>0.62ms</td>
      <td>1.27ms</td>
      <td>67.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>2.64ms</td>
      <td>1.64ms</td>
      <td>1.00ms</td>
      <td>37.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>4.48ms</td>
      <td>0.86ms</td>
      <td>3.62ms</td>
      <td>80.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.89ms</td>
      <td>1.11ms</td>
      <td>0.77ms</td>
      <td>41.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>2.06ms</td>
      <td>0.71ms</td>
      <td>1.35ms</td>
      <td>65.5%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>18.29ms</td>
      <td>3.55ms</td>
      <td>14.73ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>19.38ms</td>
      <td>3.55ms</td>
      <td>15.83ms</td>
      <td>81.7%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Python 3.11_
