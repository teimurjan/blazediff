# Pixel By Pixel Benchmarks

Comparisons that compare pixels directly (RGBA or YIQ perceptual delta). Image decode is excluded except where the section title explicitly says "image IO included" (native binary, Python bindings).

## JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~78.4%** performance improvement on average.

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
      <td>373.06ms</td>
      <td>41.81ms</td>
      <td>331.24ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>21.96ms</td>
      <td>3.41ms</td>
      <td>18.55ms</td>
      <td>84.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>349.73ms</td>
      <td>60.57ms</td>
      <td>289.17ms</td>
      <td>82.7%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>24.36ms</td>
      <td>4.39ms</td>
      <td>19.97ms</td>
      <td>82.0%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>462.10ms</td>
      <td>55.22ms</td>
      <td>406.88ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>28.12ms</td>
      <td>4.90ms</td>
      <td>23.22ms</td>
      <td>82.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.32ms</td>
      <td>0.16ms</td>
      <td>1.16ms</td>
      <td>87.6%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.54ms</td>
      <td>0.06ms</td>
      <td>0.48ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.81ms</td>
      <td>0.54ms</td>
      <td>1.26ms</td>
      <td>69.8%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.44ms</td>
      <td>0.05ms</td>
      <td>0.39ms</td>
      <td>88.7%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>11.07ms</td>
      <td>4.56ms</td>
      <td>6.51ms</td>
      <td>58.8%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>2.02ms</td>
      <td>0.27ms</td>
      <td>1.75ms</td>
      <td>86.8%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>13.09ms</td>
      <td>2.55ms</td>
      <td>10.53ms</td>
      <td>80.5%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.77ms</td>
      <td>0.81ms</td>
      <td>3.97ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>147.82ms</td>
      <td>16.22ms</td>
      <td>131.60ms</td>
      <td>89.0%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>71.42ms</td>
      <td>11.35ms</td>
      <td>60.07ms</td>
      <td>84.1%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>545.14ms</td>
      <td>72.54ms</td>
      <td>472.60ms</td>
      <td>86.7%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>49.73ms</td>
      <td>8.88ms</td>
      <td>40.85ms</td>
      <td>82.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.62ms</td>
      <td>0.15ms</td>
      <td>0.47ms</td>
      <td>75.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.18ms</td>
      <td>0.02ms</td>
      <td>0.16ms</td>
      <td>89.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.36ms</td>
      <td>1.01ms</td>
      <td>1.35ms</td>
      <td>57.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.38ms</td>
      <td>0.12ms</td>
      <td>0.26ms</td>
      <td>67.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.16ms</td>
      <td>0.02ms</td>
      <td>0.14ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.40ms</td>
      <td>2.41ms</td>
      <td>2.00ms</td>
      <td>45.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.22ms</td>
      <td>0.03ms</td>
      <td>0.19ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.20ms</td>
      <td>0.13ms</td>
      <td>0.07ms</td>
      <td>35.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.08ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>86.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.84ms</td>
      <td>0.66ms</td>
      <td>0.18ms</td>
      <td>21.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.09ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>87.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>2.95ms</td>
      <td>0.51ms</td>
      <td>2.44ms</td>
      <td>82.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.31ms</td>
      <td>0.04ms</td>
      <td>0.27ms</td>
      <td>86.6%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>2.20ms</td>
      <td>0.25ms</td>
      <td>1.94ms</td>
      <td>88.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>2.16ms</td>
      <td>0.27ms</td>
      <td>1.90ms</td>
      <td>87.6%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~52.1%** performance improvement on average.

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
      <td>431.82ms</td>
      <td>98.78ms</td>
      <td>333.03ms</td>
      <td>77.1%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>77.66ms</td>
      <td>56.46ms</td>
      <td>21.20ms</td>
      <td>27.3%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>413.51ms</td>
      <td>118.75ms</td>
      <td>294.76ms</td>
      <td>71.3%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>86.18ms</td>
      <td>62.14ms</td>
      <td>24.04ms</td>
      <td>27.9%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>544.79ms</td>
      <td>126.63ms</td>
      <td>418.15ms</td>
      <td>76.8%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>98.42ms</td>
      <td>82.07ms</td>
      <td>16.35ms</td>
      <td>16.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.78ms</td>
      <td>0.85ms</td>
      <td>1.93ms</td>
      <td>69.4%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.88ms</td>
      <td>0.75ms</td>
      <td>1.13ms</td>
      <td>60.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.97ms</td>
      <td>0.96ms</td>
      <td>2.02ms</td>
      <td>67.8%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.51ms</td>
      <td>0.39ms</td>
      <td>1.11ms</td>
      <td>73.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>17.32ms</td>
      <td>9.45ms</td>
      <td>7.87ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>7.37ms</td>
      <td>4.98ms</td>
      <td>2.40ms</td>
      <td>32.5%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>25.76ms</td>
      <td>5.06ms</td>
      <td>20.70ms</td>
      <td>80.4%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>16.22ms</td>
      <td>3.44ms</td>
      <td>12.78ms</td>
      <td>78.8%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>337.97ms</td>
      <td>116.67ms</td>
      <td>221.30ms</td>
      <td>65.5%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>242.42ms</td>
      <td>106.45ms</td>
      <td>135.97ms</td>
      <td>56.1%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>671.29ms</td>
      <td>138.88ms</td>
      <td>532.41ms</td>
      <td>79.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>180.31ms</td>
      <td>67.99ms</td>
      <td>112.31ms</td>
      <td>62.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>1.07ms</td>
      <td>0.31ms</td>
      <td>0.76ms</td>
      <td>70.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.57ms</td>
      <td>0.19ms</td>
      <td>0.37ms</td>
      <td>65.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.62ms</td>
      <td>1.18ms</td>
      <td>1.44ms</td>
      <td>55.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.26ms</td>
      <td>0.19ms</td>
      <td>0.08ms</td>
      <td>29.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.80ms</td>
      <td>0.28ms</td>
      <td>0.52ms</td>
      <td>64.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.59ms</td>
      <td>0.18ms</td>
      <td>0.41ms</td>
      <td>69.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>5.10ms</td>
      <td>2.62ms</td>
      <td>2.48ms</td>
      <td>48.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.79ms</td>
      <td>0.54ms</td>
      <td>0.25ms</td>
      <td>31.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.43ms</td>
      <td>0.54ms</td>
      <td>-0.11ms</td>
      <td>-25.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.28ms</td>
      <td>0.38ms</td>
      <td>-0.09ms</td>
      <td>-33.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>1.05ms</td>
      <td>0.65ms</td>
      <td>0.41ms</td>
      <td>38.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.27ms</td>
      <td>0.19ms</td>
      <td>0.08ms</td>
      <td>30.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>2.20ms</td>
      <td>1.00ms</td>
      <td>1.21ms</td>
      <td>54.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.12ms</td>
      <td>0.55ms</td>
      <td>0.57ms</td>
      <td>50.9%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>7.44ms</td>
      <td>1.92ms</td>
      <td>5.52ms</td>
      <td>74.2%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>7.48ms</td>
      <td>1.73ms</td>
      <td>5.75ms</td>
      <td>76.9%</td>
    </tr>
  </tbody>
</table>

## WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)

_25 iterations (5 warmup)_

> **~77.5%** performance improvement on average.

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
      <td>350.83ms</td>
      <td>32.95ms</td>
      <td>317.88ms</td>
      <td>90.6%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>20.92ms</td>
      <td>2.47ms</td>
      <td>18.45ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>345.40ms</td>
      <td>68.49ms</td>
      <td>276.90ms</td>
      <td>80.2%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>23.12ms</td>
      <td>2.58ms</td>
      <td>20.54ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>438.65ms</td>
      <td>44.80ms</td>
      <td>393.85ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>27.94ms</td>
      <td>3.60ms</td>
      <td>24.34ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.31ms</td>
      <td>0.25ms</td>
      <td>1.06ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.51ms</td>
      <td>0.05ms</td>
      <td>0.46ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.74ms</td>
      <td>0.58ms</td>
      <td>1.16ms</td>
      <td>66.6%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.40ms</td>
      <td>0.04ms</td>
      <td>0.36ms</td>
      <td>90.6%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>11.07ms</td>
      <td>6.41ms</td>
      <td>4.66ms</td>
      <td>42.1%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.90ms</td>
      <td>0.22ms</td>
      <td>1.68ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>12.55ms</td>
      <td>3.96ms</td>
      <td>8.59ms</td>
      <td>68.5%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.35ms</td>
      <td>0.49ms</td>
      <td>3.86ms</td>
      <td>88.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>148.69ms</td>
      <td>53.58ms</td>
      <td>95.11ms</td>
      <td>64.0%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>68.42ms</td>
      <td>8.02ms</td>
      <td>60.40ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>535.68ms</td>
      <td>71.14ms</td>
      <td>464.54ms</td>
      <td>86.7%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>48.29ms</td>
      <td>5.55ms</td>
      <td>42.74ms</td>
      <td>88.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.63ms</td>
      <td>0.11ms</td>
      <td>0.52ms</td>
      <td>83.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.16ms</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>91.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.25ms</td>
      <td>1.37ms</td>
      <td>0.88ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.40ms</td>
      <td>0.12ms</td>
      <td>0.27ms</td>
      <td>69.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.38ms</td>
      <td>2.87ms</td>
      <td>1.51ms</td>
      <td>34.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.21ms</td>
      <td>0.02ms</td>
      <td>0.19ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.19ms</td>
      <td>0.06ms</td>
      <td>0.13ms</td>
      <td>68.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.83ms</td>
      <td>0.72ms</td>
      <td>0.12ms</td>
      <td>13.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.31ms</td>
      <td>0.62ms</td>
      <td>0.68ms</td>
      <td>52.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.29ms</td>
      <td>0.03ms</td>
      <td>0.26ms</td>
      <td>89.9%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>2.02ms</td>
      <td>0.24ms</td>
      <td>1.79ms</td>
      <td>88.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>2.05ms</td>
      <td>0.24ms</td>
      <td>1.81ms</td>
      <td>88.3%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) (image IO included)

_25 runs (5 warmup)_

> **4.3-4.9x faster than odiff** on 4K images (6.5-7.2x with `BLAZEDIFF_PNG_ENABLED=1`).
> **~44.3%** performance improvement on average.

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
      <td>1238.75ms</td>
      <td>274.41ms</td>
      <td>189.94ms</td>
      <td>964.34ms</td>
      <td>77.8%</td>
      <td>1048.81ms</td>
      <td>84.7%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>278.45ms</td>
      <td>196.76ms</td>
      <td>135.13ms</td>
      <td>81.69ms</td>
      <td>29.3%</td>
      <td>143.32ms</td>
      <td>51.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1563.06ms</td>
      <td>362.59ms</td>
      <td>241.58ms</td>
      <td>1200.47ms</td>
      <td>76.8%</td>
      <td>1321.48ms</td>
      <td>84.5%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>343.28ms</td>
      <td>237.26ms</td>
      <td>158.74ms</td>
      <td>106.01ms</td>
      <td>30.9%</td>
      <td>184.54ms</td>
      <td>53.8%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1803.10ms</td>
      <td>367.63ms</td>
      <td>250.35ms</td>
      <td>1435.48ms</td>
      <td>79.6%</td>
      <td>1552.75ms</td>
      <td>86.1%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>383.71ms</td>
      <td>241.81ms</td>
      <td>167.64ms</td>
      <td>141.90ms</td>
      <td>37.0%</td>
      <td>216.07ms</td>
      <td>56.3%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>3.90ms</td>
      <td>2.54ms</td>
      <td>2.18ms</td>
      <td>1.36ms</td>
      <td>34.8%</td>
      <td>1.71ms</td>
      <td>44.0%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.60ms</td>
      <td>0.97ms</td>
      <td>0.76ms</td>
      <td>0.62ms</td>
      <td>39.0%</td>
      <td>0.84ms</td>
      <td>52.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>3.77ms</td>
      <td>2.32ms</td>
      <td>1.62ms</td>
      <td>1.45ms</td>
      <td>38.4%</td>
      <td>2.15ms</td>
      <td>57.0%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.63ms</td>
      <td>1.09ms</td>
      <td>0.72ms</td>
      <td>0.54ms</td>
      <td>33.2%</td>
      <td>0.90ms</td>
      <td>55.6%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>48.07ms</td>
      <td>25.35ms</td>
      <td>16.52ms</td>
      <td>22.71ms</td>
      <td>47.3%</td>
      <td>31.54ms</td>
      <td>65.6%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>19.97ms</td>
      <td>15.01ms</td>
      <td>10.03ms</td>
      <td>4.96ms</td>
      <td>24.8%</td>
      <td>9.94ms</td>
      <td>49.8%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>25.38ms</td>
      <td>19.72ms</td>
      <td>12.60ms</td>
      <td>5.66ms</td>
      <td>22.3%</td>
      <td>12.77ms</td>
      <td>50.3%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>8.36ms</td>
      <td>4.53ms</td>
      <td>3.62ms</td>
      <td>3.83ms</td>
      <td>45.8%</td>
      <td>4.75ms</td>
      <td>56.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1021.13ms</td>
      <td>527.69ms</td>
      <td>304.24ms</td>
      <td>493.45ms</td>
      <td>48.3%</td>
      <td>716.90ms</td>
      <td>70.2%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>1084.31ms</td>
      <td>261.51ms</td>
      <td>155.67ms</td>
      <td>822.79ms</td>
      <td>75.9%</td>
      <td>928.64ms</td>
      <td>85.6%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>635.03ms</td>
      <td>252.47ms</td>
      <td>162.94ms</td>
      <td>382.56ms</td>
      <td>60.2%</td>
      <td>472.09ms</td>
      <td>74.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>221.32ms</td>
      <td>43.98ms</td>
      <td>34.97ms</td>
      <td>177.34ms</td>
      <td>80.1%</td>
      <td>186.35ms</td>
      <td>84.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>3.38ms</td>
      <td>1.55ms</td>
      <td>0.99ms</td>
      <td>1.82ms</td>
      <td>54.0%</td>
      <td>2.39ms</td>
      <td>70.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>1.88ms</td>
      <td>1.18ms</td>
      <td>0.71ms</td>
      <td>0.70ms</td>
      <td>37.3%</td>
      <td>1.17ms</td>
      <td>62.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>3.67ms</td>
      <td>1.79ms</td>
      <td>1.55ms</td>
      <td>1.87ms</td>
      <td>51.1%</td>
      <td>2.11ms</td>
      <td>57.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.69ms</td>
      <td>0.49ms</td>
      <td>0.23ms</td>
      <td>0.20ms</td>
      <td>29.4%</td>
      <td>0.46ms</td>
      <td>66.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.53ms</td>
      <td>1.33ms</td>
      <td>0.94ms</td>
      <td>1.20ms</td>
      <td>47.4%</td>
      <td>1.59ms</td>
      <td>62.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>1.61ms</td>
      <td>0.92ms</td>
      <td>0.52ms</td>
      <td>0.69ms</td>
      <td>43.0%</td>
      <td>1.09ms</td>
      <td>67.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>10.38ms</td>
      <td>6.29ms</td>
      <td>3.82ms</td>
      <td>4.08ms</td>
      <td>39.4%</td>
      <td>6.56ms</td>
      <td>63.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>2.99ms</td>
      <td>2.19ms</td>
      <td>1.29ms</td>
      <td>0.80ms</td>
      <td>26.8%</td>
      <td>1.70ms</td>
      <td>56.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.90ms</td>
      <td>0.81ms</td>
      <td>1.04ms</td>
      <td>0.09ms</td>
      <td>9.9%</td>
      <td>-0.13ms</td>
      <td>-14.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.88ms</td>
      <td>0.58ms</td>
      <td>0.41ms</td>
      <td>0.31ms</td>
      <td>34.5%</td>
      <td>0.48ms</td>
      <td>54.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>6.06ms</td>
      <td>1.81ms</td>
      <td>1.29ms</td>
      <td>4.25ms</td>
      <td>70.2%</td>
      <td>4.77ms</td>
      <td>78.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.58ms</td>
      <td>0.90ms</td>
      <td>0.53ms</td>
      <td>0.68ms</td>
      <td>43.3%</td>
      <td>1.05ms</td>
      <td>66.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.85ms</td>
      <td>1.71ms</td>
      <td>1.15ms</td>
      <td>2.14ms</td>
      <td>55.5%</td>
      <td>2.70ms</td>
      <td>70.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.72ms</td>
      <td>0.67ms</td>
      <td>0.34ms</td>
      <td>0.05ms</td>
      <td>6.6%</td>
      <td>0.37ms</td>
      <td>52.1%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>5.65ms</td>
      <td>3.33ms</td>
      <td>2.74ms</td>
      <td>2.32ms</td>
      <td>41.0%</td>
      <td>2.91ms</td>
      <td>51.6%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>5.32ms</td>
      <td>3.37ms</td>
      <td>2.70ms</td>
      <td>1.96ms</td>
      <td>36.7%</td>
      <td>2.63ms</td>
      <td>49.3%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max using hyperfine_

## JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) (image IO included)

_25 runs (5 warmup)_

> **~63.4%** performance improvement on average.

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
      <td>1597.92ms</td>
      <td>270.69ms</td>
      <td>1327.23ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>520.50ms</td>
      <td>195.56ms</td>
      <td>324.94ms</td>
      <td>62.4%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1382.38ms</td>
      <td>347.39ms</td>
      <td>1034.99ms</td>
      <td>74.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>613.95ms</td>
      <td>236.50ms</td>
      <td>377.45ms</td>
      <td>61.5%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1306.04ms</td>
      <td>350.27ms</td>
      <td>955.77ms</td>
      <td>73.2%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>708.34ms</td>
      <td>242.84ms</td>
      <td>465.50ms</td>
      <td>65.7%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.59ms</td>
      <td>2.34ms</td>
      <td>2.25ms</td>
      <td>49.0%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.40ms</td>
      <td>1.21ms</td>
      <td>3.19ms</td>
      <td>72.5%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.31ms</td>
      <td>2.34ms</td>
      <td>1.97ms</td>
      <td>45.8%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>3.75ms</td>
      <td>1.07ms</td>
      <td>2.69ms</td>
      <td>71.6%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>44.38ms</td>
      <td>25.06ms</td>
      <td>19.33ms</td>
      <td>43.5%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>40.28ms</td>
      <td>14.95ms</td>
      <td>25.33ms</td>
      <td>62.9%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>26.91ms</td>
      <td>19.82ms</td>
      <td>7.09ms</td>
      <td>26.4%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>25.95ms</td>
      <td>4.49ms</td>
      <td>21.46ms</td>
      <td>82.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>774.88ms</td>
      <td>490.02ms</td>
      <td>284.86ms</td>
      <td>36.8%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>772.38ms</td>
      <td>257.20ms</td>
      <td>515.18ms</td>
      <td>66.7%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>1575.85ms</td>
      <td>247.83ms</td>
      <td>1328.02ms</td>
      <td>84.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>362.77ms</td>
      <td>44.09ms</td>
      <td>318.68ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>4.93ms</td>
      <td>1.52ms</td>
      <td>3.42ms</td>
      <td>69.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>2.64ms</td>
      <td>1.17ms</td>
      <td>1.48ms</td>
      <td>55.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>5.00ms</td>
      <td>1.76ms</td>
      <td>3.24ms</td>
      <td>64.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.45ms</td>
      <td>0.51ms</td>
      <td>0.93ms</td>
      <td>64.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.45ms</td>
      <td>1.34ms</td>
      <td>1.11ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.45ms</td>
      <td>0.90ms</td>
      <td>1.55ms</td>
      <td>63.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>11.30ms</td>
      <td>4.88ms</td>
      <td>6.42ms</td>
      <td>56.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>6.00ms</td>
      <td>2.19ms</td>
      <td>3.81ms</td>
      <td>63.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.56ms</td>
      <td>0.89ms</td>
      <td>0.68ms</td>
      <td>43.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.66ms</td>
      <td>0.57ms</td>
      <td>1.09ms</td>
      <td>65.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>5.35ms</td>
      <td>1.87ms</td>
      <td>3.48ms</td>
      <td>65.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.85ms</td>
      <td>0.85ms</td>
      <td>0.99ms</td>
      <td>53.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.96ms</td>
      <td>1.73ms</td>
      <td>2.23ms</td>
      <td>56.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>3.00ms</td>
      <td>0.64ms</td>
      <td>2.36ms</td>
      <td>78.7%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>15.81ms</td>
      <td>3.25ms</td>
      <td>12.56ms</td>
      <td>79.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>15.18ms</td>
      <td>3.30ms</td>
      <td>11.88ms</td>
      <td>78.2%</td>
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
