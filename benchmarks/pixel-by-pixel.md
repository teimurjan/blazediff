# Pixel By Pixel Benchmarks

Comparisons that compare pixels directly (RGBA or YIQ perceptual delta). Image decode is excluded except where the section title explicitly says "image IO included" (native binary, Python bindings).

## JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~68.2%** performance improvement on average.

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
      <td>325.26ms</td>
      <td>95.14ms</td>
      <td>230.12ms</td>
      <td>70.7%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>23.07ms</td>
      <td>2.86ms</td>
      <td>20.21ms</td>
      <td>87.6%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>325.55ms</td>
      <td>104.47ms</td>
      <td>221.08ms</td>
      <td>67.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>23.41ms</td>
      <td>3.48ms</td>
      <td>19.92ms</td>
      <td>85.1%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>410.77ms</td>
      <td>126.11ms</td>
      <td>284.66ms</td>
      <td>69.3%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>34.26ms</td>
      <td>4.31ms</td>
      <td>29.95ms</td>
      <td>87.4%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.24ms</td>
      <td>0.69ms</td>
      <td>0.55ms</td>
      <td>44.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.49ms</td>
      <td>0.06ms</td>
      <td>0.44ms</td>
      <td>88.5%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.79ms</td>
      <td>0.94ms</td>
      <td>0.85ms</td>
      <td>47.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.40ms</td>
      <td>0.06ms</td>
      <td>0.34ms</td>
      <td>84.4%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>10.52ms</td>
      <td>7.51ms</td>
      <td>3.01ms</td>
      <td>28.6%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.86ms</td>
      <td>0.23ms</td>
      <td>1.64ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>13.96ms</td>
      <td>7.36ms</td>
      <td>6.60ms</td>
      <td>47.3%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.39ms</td>
      <td>0.65ms</td>
      <td>3.74ms</td>
      <td>85.2%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>160.55ms</td>
      <td>94.51ms</td>
      <td>66.03ms</td>
      <td>41.1%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>69.46ms</td>
      <td>10.40ms</td>
      <td>59.06ms</td>
      <td>85.0%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>524.32ms</td>
      <td>152.42ms</td>
      <td>371.90ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>48.55ms</td>
      <td>6.87ms</td>
      <td>41.68ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.58ms</td>
      <td>0.31ms</td>
      <td>0.28ms</td>
      <td>47.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.27ms</td>
      <td>0.02ms</td>
      <td>0.25ms</td>
      <td>93.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.19ms</td>
      <td>1.61ms</td>
      <td>0.58ms</td>
      <td>26.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.37ms</td>
      <td>0.23ms</td>
      <td>0.14ms</td>
      <td>38.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.02ms</td>
      <td>0.13ms</td>
      <td>89.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.24ms</td>
      <td>2.88ms</td>
      <td>1.36ms</td>
      <td>32.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.21ms</td>
      <td>0.03ms</td>
      <td>0.18ms</td>
      <td>87.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.18ms</td>
      <td>0.12ms</td>
      <td>0.07ms</td>
      <td>36.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.80ms</td>
      <td>0.57ms</td>
      <td>0.23ms</td>
      <td>28.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>87.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.26ms</td>
      <td>0.81ms</td>
      <td>0.45ms</td>
      <td>35.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.28ms</td>
      <td>0.03ms</td>
      <td>0.25ms</td>
      <td>89.4%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>3.16ms</td>
      <td>0.24ms</td>
      <td>2.92ms</td>
      <td>92.5%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>3.40ms</td>
      <td>0.24ms</td>
      <td>3.16ms</td>
      <td>92.9%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~35.1%** performance improvement on average.

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
      <td>414.83ms</td>
      <td>142.07ms</td>
      <td>272.76ms</td>
      <td>65.8%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>76.37ms</td>
      <td>48.86ms</td>
      <td>27.51ms</td>
      <td>36.0%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>382.27ms</td>
      <td>161.62ms</td>
      <td>220.65ms</td>
      <td>57.7%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>84.56ms</td>
      <td>58.27ms</td>
      <td>26.29ms</td>
      <td>31.1%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>492.60ms</td>
      <td>190.08ms</td>
      <td>302.52ms</td>
      <td>61.4%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>99.22ms</td>
      <td>66.46ms</td>
      <td>32.76ms</td>
      <td>33.0%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.63ms</td>
      <td>1.97ms</td>
      <td>0.66ms</td>
      <td>25.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.74ms</td>
      <td>1.26ms</td>
      <td>0.48ms</td>
      <td>27.8%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.96ms</td>
      <td>1.95ms</td>
      <td>1.01ms</td>
      <td>34.2%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.42ms</td>
      <td>0.98ms</td>
      <td>0.44ms</td>
      <td>31.3%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>19.56ms</td>
      <td>12.32ms</td>
      <td>7.24ms</td>
      <td>37.0%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>6.69ms</td>
      <td>4.48ms</td>
      <td>2.21ms</td>
      <td>33.0%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>25.41ms</td>
      <td>18.26ms</td>
      <td>7.15ms</td>
      <td>28.1%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>15.22ms</td>
      <td>10.37ms</td>
      <td>4.86ms</td>
      <td>31.9%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>351.06ms</td>
      <td>267.30ms</td>
      <td>83.76ms</td>
      <td>23.9%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>242.34ms</td>
      <td>163.10ms</td>
      <td>79.24ms</td>
      <td>32.7%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>642.24ms</td>
      <td>269.63ms</td>
      <td>372.62ms</td>
      <td>58.0%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>189.05ms</td>
      <td>114.31ms</td>
      <td>74.74ms</td>
      <td>39.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>1.64ms</td>
      <td>0.68ms</td>
      <td>0.96ms</td>
      <td>58.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.72ms</td>
      <td>0.35ms</td>
      <td>0.37ms</td>
      <td>51.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.36ms</td>
      <td>1.95ms</td>
      <td>0.41ms</td>
      <td>17.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.28ms</td>
      <td>0.18ms</td>
      <td>0.10ms</td>
      <td>36.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.79ms</td>
      <td>0.63ms</td>
      <td>0.16ms</td>
      <td>20.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.52ms</td>
      <td>0.35ms</td>
      <td>0.17ms</td>
      <td>32.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.73ms</td>
      <td>3.43ms</td>
      <td>1.31ms</td>
      <td>27.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.72ms</td>
      <td>0.49ms</td>
      <td>0.23ms</td>
      <td>32.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.39ms</td>
      <td>0.32ms</td>
      <td>0.08ms</td>
      <td>19.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.27ms</td>
      <td>0.18ms</td>
      <td>0.09ms</td>
      <td>32.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>1.01ms</td>
      <td>0.84ms</td>
      <td>0.17ms</td>
      <td>17.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.27ms</td>
      <td>0.18ms</td>
      <td>0.09ms</td>
      <td>33.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>2.02ms</td>
      <td>1.54ms</td>
      <td>0.48ms</td>
      <td>23.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.01ms</td>
      <td>0.67ms</td>
      <td>0.34ms</td>
      <td>33.3%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>7.27ms</td>
      <td>4.72ms</td>
      <td>2.56ms</td>
      <td>35.2%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>7.26ms</td>
      <td>4.79ms</td>
      <td>2.47ms</td>
      <td>34.1%</td>
    </tr>
  </tbody>
</table>

## WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)

_25 iterations (5 warmup)_

> **~52.3%** performance improvement on average.

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
      <td>325.08ms</td>
      <td>35.95ms</td>
      <td>289.14ms</td>
      <td>88.9%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>20.79ms</td>
      <td>16.16ms</td>
      <td>4.62ms</td>
      <td>22.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>320.89ms</td>
      <td>66.39ms</td>
      <td>254.50ms</td>
      <td>79.3%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>23.47ms</td>
      <td>24.79ms</td>
      <td>-1.32ms</td>
      <td>-5.6%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>405.81ms</td>
      <td>44.62ms</td>
      <td>361.19ms</td>
      <td>89.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>28.54ms</td>
      <td>20.69ms</td>
      <td>7.85ms</td>
      <td>27.5%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.26ms</td>
      <td>0.27ms</td>
      <td>0.99ms</td>
      <td>78.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.50ms</td>
      <td>0.22ms</td>
      <td>0.27ms</td>
      <td>55.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.66ms</td>
      <td>0.50ms</td>
      <td>1.17ms</td>
      <td>70.1%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.42ms</td>
      <td>0.17ms</td>
      <td>0.24ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>10.44ms</td>
      <td>6.25ms</td>
      <td>4.19ms</td>
      <td>40.2%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.91ms</td>
      <td>0.94ms</td>
      <td>0.97ms</td>
      <td>51.0%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>12.32ms</td>
      <td>4.38ms</td>
      <td>7.94ms</td>
      <td>64.5%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.53ms</td>
      <td>2.43ms</td>
      <td>2.10ms</td>
      <td>46.4%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>150.77ms</td>
      <td>50.48ms</td>
      <td>100.29ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>67.52ms</td>
      <td>63.82ms</td>
      <td>3.70ms</td>
      <td>5.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>519.09ms</td>
      <td>75.10ms</td>
      <td>443.99ms</td>
      <td>85.5%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>49.46ms</td>
      <td>37.86ms</td>
      <td>11.59ms</td>
      <td>23.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.58ms</td>
      <td>0.11ms</td>
      <td>0.47ms</td>
      <td>80.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.07ms</td>
      <td>0.08ms</td>
      <td>53.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.28ms</td>
      <td>1.47ms</td>
      <td>0.81ms</td>
      <td>35.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.08ms</td>
      <td>0.03ms</td>
      <td>0.05ms</td>
      <td>58.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.38ms</td>
      <td>0.12ms</td>
      <td>0.27ms</td>
      <td>69.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.07ms</td>
      <td>0.08ms</td>
      <td>53.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.07ms</td>
      <td>2.96ms</td>
      <td>1.12ms</td>
      <td>27.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.21ms</td>
      <td>0.10ms</td>
      <td>0.11ms</td>
      <td>51.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.19ms</td>
      <td>0.06ms</td>
      <td>0.13ms</td>
      <td>67.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.08ms</td>
      <td>0.03ms</td>
      <td>0.04ms</td>
      <td>57.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.75ms</td>
      <td>0.65ms</td>
      <td>0.09ms</td>
      <td>12.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.08ms</td>
      <td>0.03ms</td>
      <td>0.04ms</td>
      <td>57.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.23ms</td>
      <td>0.60ms</td>
      <td>0.64ms</td>
      <td>51.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.29ms</td>
      <td>0.13ms</td>
      <td>0.16ms</td>
      <td>55.9%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>2.15ms</td>
      <td>1.16ms</td>
      <td>0.98ms</td>
      <td>45.9%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.98ms</td>
      <td>0.96ms</td>
      <td>1.03ms</td>
      <td>51.7%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) (image IO included)

_25 runs (5 warmup)_

> **4.4-4.9x faster than odiff** on 4K images (5.7-6.7x from encoded buffers).
> **~37.2%** performance improvement on average.

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
      <td>1295.41ms</td>
      <td>316.47ms</td>
      <td>233.44ms</td>
      <td>978.94ms</td>
      <td>75.6%</td>
      <td>1061.98ms</td>
      <td>82.0%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>270.99ms</td>
      <td>187.43ms</td>
      <td>150.05ms</td>
      <td>83.55ms</td>
      <td>30.8%</td>
      <td>120.94ms</td>
      <td>44.6%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1561.41ms</td>
      <td>392.91ms</td>
      <td>312.75ms</td>
      <td>1168.50ms</td>
      <td>74.8%</td>
      <td>1248.66ms</td>
      <td>80.0%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>337.51ms</td>
      <td>224.43ms</td>
      <td>167.29ms</td>
      <td>113.08ms</td>
      <td>33.5%</td>
      <td>170.22ms</td>
      <td>50.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1888.65ms</td>
      <td>393.12ms</td>
      <td>299.88ms</td>
      <td>1495.53ms</td>
      <td>79.2%</td>
      <td>1588.76ms</td>
      <td>84.1%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>389.45ms</td>
      <td>230.75ms</td>
      <td>174.67ms</td>
      <td>158.70ms</td>
      <td>40.7%</td>
      <td>214.77ms</td>
      <td>55.1%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>3.92ms</td>
      <td>3.08ms</td>
      <td>2.97ms</td>
      <td>0.83ms</td>
      <td>21.3%</td>
      <td>0.95ms</td>
      <td>24.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.53ms</td>
      <td>0.87ms</td>
      <td>0.85ms</td>
      <td>0.66ms</td>
      <td>42.9%</td>
      <td>0.68ms</td>
      <td>44.6%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.29ms</td>
      <td>3.57ms</td>
      <td>2.06ms</td>
      <td>0.72ms</td>
      <td>16.7%</td>
      <td>2.23ms</td>
      <td>52.0%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.39ms</td>
      <td>1.06ms</td>
      <td>0.76ms</td>
      <td>0.33ms</td>
      <td>23.5%</td>
      <td>0.63ms</td>
      <td>45.5%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>48.95ms</td>
      <td>32.15ms</td>
      <td>20.54ms</td>
      <td>16.81ms</td>
      <td>34.3%</td>
      <td>28.41ms</td>
      <td>58.0%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>18.79ms</td>
      <td>14.28ms</td>
      <td>11.42ms</td>
      <td>4.50ms</td>
      <td>24.0%</td>
      <td>7.36ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>23.79ms</td>
      <td>26.31ms</td>
      <td>23.92ms</td>
      <td>-2.52ms</td>
      <td>-10.6%</td>
      <td>-0.14ms</td>
      <td>-0.6%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>10.93ms</td>
      <td>4.61ms</td>
      <td>3.80ms</td>
      <td>6.32ms</td>
      <td>57.8%</td>
      <td>7.13ms</td>
      <td>65.2%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>997.86ms</td>
      <td>674.52ms</td>
      <td>547.76ms</td>
      <td>323.34ms</td>
      <td>32.4%</td>
      <td>450.11ms</td>
      <td>45.1%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>542.00ms</td>
      <td>248.55ms</td>
      <td>165.91ms</td>
      <td>293.45ms</td>
      <td>54.1%</td>
      <td>376.09ms</td>
      <td>69.4%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>607.25ms</td>
      <td>415.39ms</td>
      <td>279.56ms</td>
      <td>191.86ms</td>
      <td>31.6%</td>
      <td>327.68ms</td>
      <td>54.0%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>123.52ms</td>
      <td>42.18ms</td>
      <td>32.85ms</td>
      <td>81.35ms</td>
      <td>65.9%</td>
      <td>90.67ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>3.84ms</td>
      <td>2.23ms</td>
      <td>1.21ms</td>
      <td>1.61ms</td>
      <td>41.9%</td>
      <td>2.62ms</td>
      <td>68.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>1.73ms</td>
      <td>1.05ms</td>
      <td>0.84ms</td>
      <td>0.68ms</td>
      <td>39.1%</td>
      <td>0.89ms</td>
      <td>51.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>3.54ms</td>
      <td>1.79ms</td>
      <td>1.72ms</td>
      <td>1.75ms</td>
      <td>49.4%</td>
      <td>1.82ms</td>
      <td>51.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.53ms</td>
      <td>0.47ms</td>
      <td>0.22ms</td>
      <td>0.06ms</td>
      <td>11.0%</td>
      <td>0.31ms</td>
      <td>58.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>3.25ms</td>
      <td>1.42ms</td>
      <td>1.30ms</td>
      <td>1.82ms</td>
      <td>56.2%</td>
      <td>1.94ms</td>
      <td>59.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>1.67ms</td>
      <td>0.87ms</td>
      <td>0.63ms</td>
      <td>0.79ms</td>
      <td>47.6%</td>
      <td>1.04ms</td>
      <td>62.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>9.61ms</td>
      <td>4.85ms</td>
      <td>4.72ms</td>
      <td>4.76ms</td>
      <td>49.5%</td>
      <td>4.89ms</td>
      <td>50.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>2.64ms</td>
      <td>2.16ms</td>
      <td>1.25ms</td>
      <td>0.48ms</td>
      <td>18.2%</td>
      <td>1.39ms</td>
      <td>52.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.79ms</td>
      <td>0.97ms</td>
      <td>0.70ms</td>
      <td>-0.18ms</td>
      <td>-22.2%</td>
      <td>0.10ms</td>
      <td>12.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.85ms</td>
      <td>0.56ms</td>
      <td>0.41ms</td>
      <td>0.29ms</td>
      <td>34.4%</td>
      <td>0.44ms</td>
      <td>51.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>8.90ms</td>
      <td>2.08ms</td>
      <td>2.39ms</td>
      <td>6.83ms</td>
      <td>76.7%</td>
      <td>6.51ms</td>
      <td>73.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.98ms</td>
      <td>0.83ms</td>
      <td>0.57ms</td>
      <td>0.15ms</td>
      <td>15.1%</td>
      <td>0.41ms</td>
      <td>41.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.60ms</td>
      <td>2.64ms</td>
      <td>1.80ms</td>
      <td>0.96ms</td>
      <td>26.5%</td>
      <td>1.80ms</td>
      <td>49.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.72ms</td>
      <td>0.63ms</td>
      <td>0.31ms</td>
      <td>0.09ms</td>
      <td>12.9%</td>
      <td>0.42ms</td>
      <td>57.6%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>5.04ms</td>
      <td>3.09ms</td>
      <td>2.95ms</td>
      <td>1.96ms</td>
      <td>38.8%</td>
      <td>2.09ms</td>
      <td>41.5%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>5.50ms</td>
      <td>3.20ms</td>
      <td>2.58ms</td>
      <td>2.30ms</td>
      <td>41.8%</td>
      <td>2.92ms</td>
      <td>53.1%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max using hyperfine_

## JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) (image IO included)

_25 runs (5 warmup)_

> **~58.5%** performance improvement on average.

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
      <td>1602.12ms</td>
      <td>324.85ms</td>
      <td>1277.27ms</td>
      <td>79.7%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>547.71ms</td>
      <td>190.41ms</td>
      <td>357.30ms</td>
      <td>65.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1425.37ms</td>
      <td>377.30ms</td>
      <td>1048.07ms</td>
      <td>73.5%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>652.05ms</td>
      <td>229.49ms</td>
      <td>422.56ms</td>
      <td>64.8%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1296.92ms</td>
      <td>423.49ms</td>
      <td>873.44ms</td>
      <td>67.3%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>731.04ms</td>
      <td>239.06ms</td>
      <td>491.99ms</td>
      <td>67.3%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.29ms</td>
      <td>2.46ms</td>
      <td>1.82ms</td>
      <td>42.5%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.43ms</td>
      <td>0.92ms</td>
      <td>3.51ms</td>
      <td>79.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.17ms</td>
      <td>4.08ms</td>
      <td>0.09ms</td>
      <td>2.2%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>3.90ms</td>
      <td>1.05ms</td>
      <td>2.85ms</td>
      <td>73.0%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>45.38ms</td>
      <td>24.76ms</td>
      <td>20.62ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>40.41ms</td>
      <td>15.04ms</td>
      <td>25.37ms</td>
      <td>62.8%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>30.89ms</td>
      <td>28.47ms</td>
      <td>2.42ms</td>
      <td>7.8%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>24.95ms</td>
      <td>4.59ms</td>
      <td>20.37ms</td>
      <td>81.6%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>764.31ms</td>
      <td>629.89ms</td>
      <td>134.42ms</td>
      <td>17.6%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>779.99ms</td>
      <td>253.42ms</td>
      <td>526.58ms</td>
      <td>67.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>1544.76ms</td>
      <td>320.30ms</td>
      <td>1224.46ms</td>
      <td>79.3%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>400.10ms</td>
      <td>42.36ms</td>
      <td>357.75ms</td>
      <td>89.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>5.05ms</td>
      <td>1.89ms</td>
      <td>3.15ms</td>
      <td>62.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>2.92ms</td>
      <td>1.52ms</td>
      <td>1.41ms</td>
      <td>48.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>4.85ms</td>
      <td>1.93ms</td>
      <td>2.92ms</td>
      <td>60.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.70ms</td>
      <td>0.66ms</td>
      <td>1.03ms</td>
      <td>60.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.69ms</td>
      <td>1.86ms</td>
      <td>0.83ms</td>
      <td>30.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.53ms</td>
      <td>0.88ms</td>
      <td>1.65ms</td>
      <td>65.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>12.25ms</td>
      <td>4.98ms</td>
      <td>7.26ms</td>
      <td>59.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>5.94ms</td>
      <td>1.99ms</td>
      <td>3.95ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.77ms</td>
      <td>1.07ms</td>
      <td>0.69ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.55ms</td>
      <td>0.61ms</td>
      <td>0.95ms</td>
      <td>60.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>5.24ms</td>
      <td>2.65ms</td>
      <td>2.59ms</td>
      <td>49.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.91ms</td>
      <td>0.88ms</td>
      <td>1.03ms</td>
      <td>53.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.74ms</td>
      <td>2.81ms</td>
      <td>0.93ms</td>
      <td>24.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>3.46ms</td>
      <td>0.64ms</td>
      <td>2.83ms</td>
      <td>81.6%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>16.00ms</td>
      <td>3.45ms</td>
      <td>12.55ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>16.74ms</td>
      <td>3.44ms</td>
      <td>13.29ms</td>
      <td>79.4%</td>
    </tr>
  </tbody>
</table>

## Python Bindings (`blazediff` PyPI via PyO3) (image IO included)

The PyO3-backed `blazediff` PyPI package wraps the same Rust core as the native binary; published as platform-tagged wheels (manylinux / macOS / Windows). Comparisons below use the path-based `compare()` API, so PNG decode is part of the timed region (directly comparable to the Native Binary section above).

### vs `pixelmatch` (pypi)

_25 iterations (5 warmup) for blazediff; 10 iterations (5 warmup) for pixelmatch (pypi)_

> **~82.4%** performance improvement on average.

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
      <td>216.28ms</td>
      <td>19988.11ms</td>
      <td>98.9%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>595.85ms</td>
      <td>192.40ms</td>
      <td>403.45ms</td>
      <td>67.7%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>23276.66ms</td>
      <td>265.24ms</td>
      <td>23011.42ms</td>
      <td>98.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>734.42ms</td>
      <td>232.10ms</td>
      <td>502.32ms</td>
      <td>68.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>26298.68ms</td>
      <td>272.76ms</td>
      <td>26025.93ms</td>
      <td>99.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>792.13ms</td>
      <td>240.51ms</td>
      <td>551.62ms</td>
      <td>69.6%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>261.43ms</td>
      <td>0.86ms</td>
      <td>260.58ms</td>
      <td>99.7%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.18ms</td>
      <td>0.99ms</td>
      <td>3.19ms</td>
      <td>76.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>271.18ms</td>
      <td>1.00ms</td>
      <td>270.18ms</td>
      <td>99.6%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>3.81ms</td>
      <td>0.95ms</td>
      <td>2.86ms</td>
      <td>75.1%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>1503.28ms</td>
      <td>14.68ms</td>
      <td>1488.60ms</td>
      <td>99.0%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>46.32ms</td>
      <td>14.38ms</td>
      <td>31.94ms</td>
      <td>69.0%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>2477.67ms</td>
      <td>5.17ms</td>
      <td>2472.49ms</td>
      <td>99.8%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>28.76ms</td>
      <td>4.94ms</td>
      <td>23.82ms</td>
      <td>82.8%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>40254.90ms</td>
      <td>268.14ms</td>
      <td>39986.76ms</td>
      <td>99.3%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>871.79ms</td>
      <td>267.88ms</td>
      <td>603.91ms</td>
      <td>69.3%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>42516.84ms</td>
      <td>97.96ms</td>
      <td>42418.88ms</td>
      <td>99.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>178.74ms</td>
      <td>55.83ms</td>
      <td>122.91ms</td>
      <td>68.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>88.66ms</td>
      <td>1.15ms</td>
      <td>87.52ms</td>
      <td>98.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>2.86ms</td>
      <td>1.09ms</td>
      <td>1.77ms</td>
      <td>61.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>179.13ms</td>
      <td>0.69ms</td>
      <td>178.44ms</td>
      <td>99.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.89ms</td>
      <td>0.45ms</td>
      <td>0.44ms</td>
      <td>49.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>86.57ms</td>
      <td>0.94ms</td>
      <td>85.63ms</td>
      <td>98.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.25ms</td>
      <td>0.83ms</td>
      <td>1.42ms</td>
      <td>63.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>376.98ms</td>
      <td>2.66ms</td>
      <td>374.31ms</td>
      <td>99.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>5.69ms</td>
      <td>1.98ms</td>
      <td>3.70ms</td>
      <td>65.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>44.24ms</td>
      <td>0.56ms</td>
      <td>43.68ms</td>
      <td>98.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.13ms</td>
      <td>0.60ms</td>
      <td>0.53ms</td>
      <td>47.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>108.60ms</td>
      <td>1.27ms</td>
      <td>107.32ms</td>
      <td>98.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.59ms</td>
      <td>0.79ms</td>
      <td>0.79ms</td>
      <td>50.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>192.89ms</td>
      <td>0.72ms</td>
      <td>192.17ms</td>
      <td>99.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.53ms</td>
      <td>0.63ms</td>
      <td>0.90ms</td>
      <td>59.0%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>23.42ms</td>
      <td>3.52ms</td>
      <td>19.90ms</td>
      <td>85.0%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>25.54ms</td>
      <td>3.14ms</td>
      <td>22.40ms</td>
      <td>87.7%</td>
    </tr>
  </tbody>
</table>

### vs `opencv-python` (`cv2.absdiff`)

_25 iterations (5 warmup)_

> **~69.5%** performance improvement on average.

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
      <td>222.47ms</td>
      <td>394.07ms</td>
      <td>63.9%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>781.71ms</td>
      <td>197.12ms</td>
      <td>584.59ms</td>
      <td>74.8%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>709.73ms</td>
      <td>263.40ms</td>
      <td>446.33ms</td>
      <td>62.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>694.59ms</td>
      <td>233.19ms</td>
      <td>461.40ms</td>
      <td>66.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>820.47ms</td>
      <td>274.95ms</td>
      <td>545.51ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>789.61ms</td>
      <td>264.16ms</td>
      <td>525.46ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.94ms</td>
      <td>1.09ms</td>
      <td>3.85ms</td>
      <td>77.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.50ms</td>
      <td>0.83ms</td>
      <td>3.66ms</td>
      <td>81.5%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.14ms</td>
      <td>1.13ms</td>
      <td>3.01ms</td>
      <td>72.7%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>4.01ms</td>
      <td>1.06ms</td>
      <td>2.96ms</td>
      <td>73.7%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>44.59ms</td>
      <td>15.84ms</td>
      <td>28.75ms</td>
      <td>64.5%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>44.49ms</td>
      <td>15.85ms</td>
      <td>28.63ms</td>
      <td>64.4%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>30.53ms</td>
      <td>5.13ms</td>
      <td>25.40ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>30.23ms</td>
      <td>5.03ms</td>
      <td>25.21ms</td>
      <td>83.4%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1063.19ms</td>
      <td>309.77ms</td>
      <td>753.43ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>1205.75ms</td>
      <td>269.15ms</td>
      <td>936.60ms</td>
      <td>77.7%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>305.51ms</td>
      <td>108.90ms</td>
      <td>196.61ms</td>
      <td>64.4%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>288.35ms</td>
      <td>54.88ms</td>
      <td>233.46ms</td>
      <td>81.0%</td>
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
      <td>1.08ms</td>
      <td>3.32ms</td>
      <td>75.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>1.16ms</td>
      <td>0.75ms</td>
      <td>0.41ms</td>
      <td>35.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.07ms</td>
      <td>0.50ms</td>
      <td>0.58ms</td>
      <td>53.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>3.40ms</td>
      <td>1.03ms</td>
      <td>2.37ms</td>
      <td>69.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>3.96ms</td>
      <td>0.92ms</td>
      <td>3.04ms</td>
      <td>76.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>7.76ms</td>
      <td>2.88ms</td>
      <td>4.88ms</td>
      <td>62.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>6.00ms</td>
      <td>2.17ms</td>
      <td>3.83ms</td>
      <td>63.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.84ms</td>
      <td>0.57ms</td>
      <td>1.27ms</td>
      <td>68.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.89ms</td>
      <td>0.57ms</td>
      <td>1.31ms</td>
      <td>69.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>2.64ms</td>
      <td>1.20ms</td>
      <td>1.45ms</td>
      <td>54.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>4.48ms</td>
      <td>0.88ms</td>
      <td>3.60ms</td>
      <td>80.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.89ms</td>
      <td>0.75ms</td>
      <td>1.14ms</td>
      <td>60.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>2.06ms</td>
      <td>0.62ms</td>
      <td>1.44ms</td>
      <td>70.0%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>18.29ms</td>
      <td>3.60ms</td>
      <td>14.69ms</td>
      <td>80.3%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>19.38ms</td>
      <td>3.15ms</td>
      <td>16.23ms</td>
      <td>83.8%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Python 3.11_
