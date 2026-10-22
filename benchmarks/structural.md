# Structural Similarity Benchmarks

Per-window image quality comparisons (SSIM family). Image decode is excluded.


Read each section against its own baseline, not against the other one. The two
metrics are not given the same amount of work: `ssim` follows MATLAB's `ssim.m`
and shrinks the image to ~256px on the short edge before it measures anything,
while `hitchhikers-ssim` always runs at full resolution. On the largest fixture
that is 264x573 pixels versus 3.8M.

That is also why the Rust port wins by so much more on one than the other
(~15x vs ~4x). Nearly all of Hitchhiker's time is the single full-resolution
pass that builds its lookup tables, not the comparison itself — widening the
window stride to compare 34x fewer positions moves it only 26.9ms -> 24.8ms.
That pass is a running total, so it has to go pixel by pixel in order, whereas
the convolutions it replaces vectorise. In JavaScript the trick is a large win
because the math it avoids is slow there; in Rust it costs more than it saves.

## Fast Original ( `@blazediff/ssim` using `ssim` vs `ssim.js` using `fast` algorithm) (image IO excluded)

_25 iterations (3 warmup)_

> **~29.2%** performance improvement on average.

The percentage above is the JavaScript port. `@blazediff/ssim-native` is the
Rust one, wrapping the same algorithm — roughly **15x** faster again than the JS
port, from the same decoded buffers.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">ssim.js</th>
      <th width="500">BlazeDiff</th>
      <th width="500">BlazeDiff (ssim-native)</th>
      <th width="500">BlazeDiff Saved</th>
      <th width="500">BlazeDiff %</th>
      <th width="500">BlazeDiff (ssim-native) Saved</th>
      <th width="500">BlazeDiff (ssim-native) %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blazediff/1</td>
      <td>92.94ms</td>
      <td>65.98ms</td>
      <td>5.36ms</td>
      <td>26.96ms</td>
      <td>29.0%</td>
      <td>87.58ms</td>
      <td>94.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>99.29ms</td>
      <td>65.49ms</td>
      <td>7.92ms</td>
      <td>33.80ms</td>
      <td>34.0%</td>
      <td>91.37ms</td>
      <td>92.0%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>39.45ms</td>
      <td>23.49ms</td>
      <td>1.55ms</td>
      <td>15.97ms</td>
      <td>40.5%</td>
      <td>37.90ms</td>
      <td>96.1%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>36.44ms</td>
      <td>24.04ms</td>
      <td>1.60ms</td>
      <td>12.40ms</td>
      <td>34.0%</td>
      <td>34.84ms</td>
      <td>95.6%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>111.88ms</td>
      <td>98.71ms</td>
      <td>5.47ms</td>
      <td>13.17ms</td>
      <td>11.8%</td>
      <td>106.41ms</td>
      <td>95.1%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>106.23ms</td>
      <td>100.30ms</td>
      <td>5.03ms</td>
      <td>5.93ms</td>
      <td>5.6%</td>
      <td>101.20ms</td>
      <td>95.3%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>258.64ms</td>
      <td>225.62ms</td>
      <td>12.26ms</td>
      <td>33.02ms</td>
      <td>12.8%</td>
      <td>246.38ms</td>
      <td>95.3%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>267.57ms</td>
      <td>228.56ms</td>
      <td>11.99ms</td>
      <td>39.01ms</td>
      <td>14.6%</td>
      <td>255.58ms</td>
      <td>95.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>28.25ms</td>
      <td>20.13ms</td>
      <td>1.63ms</td>
      <td>8.12ms</td>
      <td>28.7%</td>
      <td>26.61ms</td>
      <td>94.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>30.38ms</td>
      <td>19.79ms</td>
      <td>1.57ms</td>
      <td>10.59ms</td>
      <td>34.9%</td>
      <td>28.81ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>13.92ms</td>
      <td>10.90ms</td>
      <td>0.87ms</td>
      <td>3.02ms</td>
      <td>21.7%</td>
      <td>13.06ms</td>
      <td>93.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>14.40ms</td>
      <td>9.96ms</td>
      <td>0.76ms</td>
      <td>4.44ms</td>
      <td>30.8%</td>
      <td>13.64ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>30.00ms</td>
      <td>19.92ms</td>
      <td>1.60ms</td>
      <td>10.09ms</td>
      <td>33.6%</td>
      <td>28.40ms</td>
      <td>94.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>28.97ms</td>
      <td>19.86ms</td>
      <td>1.63ms</td>
      <td>9.11ms</td>
      <td>31.4%</td>
      <td>27.33ms</td>
      <td>94.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>19.65ms</td>
      <td>11.76ms</td>
      <td>0.79ms</td>
      <td>7.89ms</td>
      <td>40.2%</td>
      <td>18.86ms</td>
      <td>96.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>20.60ms</td>
      <td>11.88ms</td>
      <td>0.81ms</td>
      <td>8.72ms</td>
      <td>42.3%</td>
      <td>19.79ms</td>
      <td>96.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>14.34ms</td>
      <td>10.15ms</td>
      <td>0.76ms</td>
      <td>4.19ms</td>
      <td>29.2%</td>
      <td>13.58ms</td>
      <td>94.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>15.07ms</td>
      <td>9.94ms</td>
      <td>0.78ms</td>
      <td>5.13ms</td>
      <td>34.1%</td>
      <td>14.29ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>14.38ms</td>
      <td>9.98ms</td>
      <td>0.76ms</td>
      <td>4.41ms</td>
      <td>30.6%</td>
      <td>13.62ms</td>
      <td>94.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>13.79ms</td>
      <td>10.70ms</td>
      <td>0.77ms</td>
      <td>3.09ms</td>
      <td>22.4%</td>
      <td>13.02ms</td>
      <td>94.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>27.20ms</td>
      <td>16.64ms</td>
      <td>1.32ms</td>
      <td>10.56ms</td>
      <td>38.8%</td>
      <td>25.88ms</td>
      <td>95.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>27.96ms</td>
      <td>16.63ms</td>
      <td>1.10ms</td>
      <td>11.33ms</td>
      <td>40.5%</td>
      <td>26.86ms</td>
      <td>96.1%</td>
    </tr>
  </tbody>
</table>

## Hitchhikers SSIM SSIM (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm) (image IO excluded)

_25 iterations (3 warmup)_

> **~76.4%** performance improvement on average.

The percentage above is the JavaScript port. `@blazediff/ssim-native` is the
Rust one, wrapping the same algorithm — roughly **4x** faster again than the JS
port, from the same decoded buffers.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">ssim.js</th>
      <th width="500">BlazeDiff</th>
      <th width="500">BlazeDiff (ssim-native)</th>
      <th width="500">BlazeDiff Saved</th>
      <th width="500">BlazeDiff %</th>
      <th width="500">BlazeDiff (ssim-native) Saved</th>
      <th width="500">BlazeDiff (ssim-native) %</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>blazediff/1</td>
      <td>77.27ms</td>
      <td>12.38ms</td>
      <td>2.92ms</td>
      <td>64.89ms</td>
      <td>84.0%</td>
      <td>74.35ms</td>
      <td>96.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>77.43ms</td>
      <td>12.44ms</td>
      <td>3.06ms</td>
      <td>64.99ms</td>
      <td>83.9%</td>
      <td>74.37ms</td>
      <td>96.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>35.29ms</td>
      <td>10.04ms</td>
      <td>2.33ms</td>
      <td>25.25ms</td>
      <td>71.6%</td>
      <td>32.96ms</td>
      <td>93.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>40.30ms</td>
      <td>10.45ms</td>
      <td>2.50ms</td>
      <td>29.85ms</td>
      <td>74.1%</td>
      <td>37.80ms</td>
      <td>93.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>123.48ms</td>
      <td>47.14ms</td>
      <td>10.91ms</td>
      <td>76.34ms</td>
      <td>61.8%</td>
      <td>112.56ms</td>
      <td>91.2%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>124.52ms</td>
      <td>47.55ms</td>
      <td>11.03ms</td>
      <td>76.97ms</td>
      <td>61.8%</td>
      <td>113.50ms</td>
      <td>91.1%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>301.51ms</td>
      <td>111.94ms</td>
      <td>25.70ms</td>
      <td>189.56ms</td>
      <td>62.9%</td>
      <td>275.80ms</td>
      <td>91.5%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>315.84ms</td>
      <td>109.51ms</td>
      <td>25.09ms</td>
      <td>206.33ms</td>
      <td>65.3%</td>
      <td>290.75ms</td>
      <td>92.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>22.72ms</td>
      <td>3.75ms</td>
      <td>0.84ms</td>
      <td>18.98ms</td>
      <td>83.5%</td>
      <td>21.89ms</td>
      <td>96.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>23.13ms</td>
      <td>3.91ms</td>
      <td>0.88ms</td>
      <td>19.22ms</td>
      <td>83.1%</td>
      <td>22.25ms</td>
      <td>96.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>11.31ms</td>
      <td>1.88ms</td>
      <td>0.40ms</td>
      <td>9.43ms</td>
      <td>83.4%</td>
      <td>10.91ms</td>
      <td>96.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>11.50ms</td>
      <td>1.91ms</td>
      <td>0.40ms</td>
      <td>9.58ms</td>
      <td>83.4%</td>
      <td>11.09ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>22.96ms</td>
      <td>3.75ms</td>
      <td>0.84ms</td>
      <td>19.21ms</td>
      <td>83.6%</td>
      <td>22.12ms</td>
      <td>96.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>23.90ms</td>
      <td>3.75ms</td>
      <td>0.84ms</td>
      <td>20.15ms</td>
      <td>84.3%</td>
      <td>23.06ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>18.61ms</td>
      <td>5.15ms</td>
      <td>1.16ms</td>
      <td>13.45ms</td>
      <td>72.3%</td>
      <td>17.44ms</td>
      <td>93.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>18.70ms</td>
      <td>5.44ms</td>
      <td>1.18ms</td>
      <td>13.26ms</td>
      <td>70.9%</td>
      <td>17.53ms</td>
      <td>93.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>11.38ms</td>
      <td>1.92ms</td>
      <td>0.41ms</td>
      <td>9.46ms</td>
      <td>83.2%</td>
      <td>10.97ms</td>
      <td>96.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>11.78ms</td>
      <td>1.86ms</td>
      <td>0.40ms</td>
      <td>9.92ms</td>
      <td>84.2%</td>
      <td>11.37ms</td>
      <td>96.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>11.37ms</td>
      <td>1.96ms</td>
      <td>0.43ms</td>
      <td>9.41ms</td>
      <td>82.8%</td>
      <td>10.94ms</td>
      <td>96.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>11.91ms</td>
      <td>1.89ms</td>
      <td>0.40ms</td>
      <td>10.01ms</td>
      <td>84.1%</td>
      <td>11.51ms</td>
      <td>96.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>24.87ms</td>
      <td>8.65ms</td>
      <td>1.71ms</td>
      <td>16.22ms</td>
      <td>65.2%</td>
      <td>23.16ms</td>
      <td>93.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>25.05ms</td>
      <td>7.20ms</td>
      <td>1.64ms</td>
      <td>17.85ms</td>
      <td>71.3%</td>
      <td>23.40ms</td>
      <td>93.4%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_
