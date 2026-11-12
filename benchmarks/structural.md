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

> **~53.6%** performance improvement on average.

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
      <td>128.60ms</td>
      <td>67.36ms</td>
      <td>6.58ms</td>
      <td>61.24ms</td>
      <td>47.6%</td>
      <td>122.02ms</td>
      <td>94.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>129.29ms</td>
      <td>67.46ms</td>
      <td>6.61ms</td>
      <td>61.83ms</td>
      <td>47.8%</td>
      <td>122.68ms</td>
      <td>94.9%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>63.12ms</td>
      <td>23.67ms</td>
      <td>2.20ms</td>
      <td>39.45ms</td>
      <td>62.5%</td>
      <td>60.93ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>63.55ms</td>
      <td>23.78ms</td>
      <td>2.20ms</td>
      <td>39.77ms</td>
      <td>62.6%</td>
      <td>61.35ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>194.01ms</td>
      <td>97.32ms</td>
      <td>8.25ms</td>
      <td>96.69ms</td>
      <td>49.8%</td>
      <td>185.77ms</td>
      <td>95.7%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>194.40ms</td>
      <td>97.11ms</td>
      <td>8.96ms</td>
      <td>97.29ms</td>
      <td>50.0%</td>
      <td>185.44ms</td>
      <td>95.4%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>547.22ms</td>
      <td>230.21ms</td>
      <td>18.55ms</td>
      <td>317.02ms</td>
      <td>57.9%</td>
      <td>528.67ms</td>
      <td>96.6%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>542.47ms</td>
      <td>228.81ms</td>
      <td>25.00ms</td>
      <td>313.66ms</td>
      <td>57.8%</td>
      <td>517.47ms</td>
      <td>95.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>38.25ms</td>
      <td>20.14ms</td>
      <td>1.99ms</td>
      <td>18.11ms</td>
      <td>47.4%</td>
      <td>36.26ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>38.65ms</td>
      <td>20.04ms</td>
      <td>1.99ms</td>
      <td>18.62ms</td>
      <td>48.2%</td>
      <td>36.66ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>19.29ms</td>
      <td>9.93ms</td>
      <td>1.03ms</td>
      <td>9.36ms</td>
      <td>48.5%</td>
      <td>18.26ms</td>
      <td>94.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>20.43ms</td>
      <td>9.96ms</td>
      <td>1.03ms</td>
      <td>10.47ms</td>
      <td>51.3%</td>
      <td>19.39ms</td>
      <td>94.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>38.95ms</td>
      <td>20.09ms</td>
      <td>1.99ms</td>
      <td>18.85ms</td>
      <td>48.4%</td>
      <td>36.96ms</td>
      <td>94.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>39.01ms</td>
      <td>20.08ms</td>
      <td>1.99ms</td>
      <td>18.93ms</td>
      <td>48.5%</td>
      <td>37.01ms</td>
      <td>94.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>33.74ms</td>
      <td>12.11ms</td>
      <td>1.09ms</td>
      <td>21.63ms</td>
      <td>64.1%</td>
      <td>32.65ms</td>
      <td>96.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>34.35ms</td>
      <td>12.14ms</td>
      <td>1.08ms</td>
      <td>22.20ms</td>
      <td>64.6%</td>
      <td>33.26ms</td>
      <td>96.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>19.31ms</td>
      <td>9.87ms</td>
      <td>1.04ms</td>
      <td>9.44ms</td>
      <td>48.9%</td>
      <td>18.27ms</td>
      <td>94.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>19.96ms</td>
      <td>9.96ms</td>
      <td>1.04ms</td>
      <td>10.00ms</td>
      <td>50.1%</td>
      <td>18.93ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>19.89ms</td>
      <td>10.00ms</td>
      <td>1.04ms</td>
      <td>9.89ms</td>
      <td>49.7%</td>
      <td>18.86ms</td>
      <td>94.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>19.32ms</td>
      <td>9.96ms</td>
      <td>1.03ms</td>
      <td>9.36ms</td>
      <td>48.4%</td>
      <td>18.28ms</td>
      <td>94.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>44.74ms</td>
      <td>16.99ms</td>
      <td>1.47ms</td>
      <td>27.75ms</td>
      <td>62.0%</td>
      <td>43.27ms</td>
      <td>96.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>44.81ms</td>
      <td>17.00ms</td>
      <td>1.49ms</td>
      <td>27.81ms</td>
      <td>62.1%</td>
      <td>43.32ms</td>
      <td>96.7%</td>
    </tr>
  </tbody>
</table>

## Hitchhikers SSIM SSIM (`@blazediff/ssim` using `hitchhikers-ssim` vs `ssim.js` using `weber` algorithm) (image IO excluded)

_25 iterations (3 warmup)_

> **~85.7%** performance improvement on average.

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
      <td>87.16ms</td>
      <td>9.92ms</td>
      <td>2.88ms</td>
      <td>77.24ms</td>
      <td>88.6%</td>
      <td>84.28ms</td>
      <td>96.7%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>87.71ms</td>
      <td>10.05ms</td>
      <td>2.93ms</td>
      <td>77.66ms</td>
      <td>88.5%</td>
      <td>84.79ms</td>
      <td>96.7%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>58.71ms</td>
      <td>8.04ms</td>
      <td>2.11ms</td>
      <td>50.67ms</td>
      <td>86.3%</td>
      <td>56.60ms</td>
      <td>96.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>57.72ms</td>
      <td>8.00ms</td>
      <td>2.12ms</td>
      <td>49.72ms</td>
      <td>86.1%</td>
      <td>55.59ms</td>
      <td>96.3%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>208.17ms</td>
      <td>45.85ms</td>
      <td>24.28ms</td>
      <td>162.32ms</td>
      <td>78.0%</td>
      <td>183.90ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>208.11ms</td>
      <td>44.84ms</td>
      <td>23.89ms</td>
      <td>163.27ms</td>
      <td>78.5%</td>
      <td>184.23ms</td>
      <td>88.5%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>608.87ms</td>
      <td>117.17ms</td>
      <td>83.84ms</td>
      <td>491.70ms</td>
      <td>80.8%</td>
      <td>525.03ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>599.43ms</td>
      <td>112.16ms</td>
      <td>84.35ms</td>
      <td>487.27ms</td>
      <td>81.3%</td>
      <td>515.09ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>26.05ms</td>
      <td>3.14ms</td>
      <td>0.75ms</td>
      <td>22.91ms</td>
      <td>87.9%</td>
      <td>25.30ms</td>
      <td>97.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>25.80ms</td>
      <td>3.12ms</td>
      <td>0.76ms</td>
      <td>22.69ms</td>
      <td>87.9%</td>
      <td>25.04ms</td>
      <td>97.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>12.55ms</td>
      <td>1.59ms</td>
      <td>0.35ms</td>
      <td>10.95ms</td>
      <td>87.3%</td>
      <td>12.19ms</td>
      <td>97.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>12.50ms</td>
      <td>1.62ms</td>
      <td>0.35ms</td>
      <td>10.88ms</td>
      <td>87.0%</td>
      <td>12.15ms</td>
      <td>97.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>26.25ms</td>
      <td>3.12ms</td>
      <td>0.78ms</td>
      <td>23.13ms</td>
      <td>88.1%</td>
      <td>25.47ms</td>
      <td>97.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>25.62ms</td>
      <td>3.14ms</td>
      <td>0.75ms</td>
      <td>22.47ms</td>
      <td>87.7%</td>
      <td>24.87ms</td>
      <td>97.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>30.74ms</td>
      <td>4.36ms</td>
      <td>1.04ms</td>
      <td>26.38ms</td>
      <td>85.8%</td>
      <td>29.70ms</td>
      <td>96.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>30.23ms</td>
      <td>4.32ms</td>
      <td>1.06ms</td>
      <td>25.91ms</td>
      <td>85.7%</td>
      <td>29.17ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>12.33ms</td>
      <td>1.56ms</td>
      <td>0.36ms</td>
      <td>10.77ms</td>
      <td>87.4%</td>
      <td>11.97ms</td>
      <td>97.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>12.68ms</td>
      <td>1.61ms</td>
      <td>0.36ms</td>
      <td>11.07ms</td>
      <td>87.3%</td>
      <td>12.32ms</td>
      <td>97.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>12.38ms</td>
      <td>1.63ms</td>
      <td>0.35ms</td>
      <td>10.75ms</td>
      <td>86.8%</td>
      <td>12.02ms</td>
      <td>97.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>12.49ms</td>
      <td>1.58ms</td>
      <td>0.35ms</td>
      <td>10.91ms</td>
      <td>87.4%</td>
      <td>12.13ms</td>
      <td>97.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>41.19ms</td>
      <td>5.80ms</td>
      <td>1.45ms</td>
      <td>35.39ms</td>
      <td>85.9%</td>
      <td>39.74ms</td>
      <td>96.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>39.52ms</td>
      <td>5.91ms</td>
      <td>1.48ms</td>
      <td>33.61ms</td>
      <td>85.1%</td>
      <td>38.04ms</td>
      <td>96.2%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on GCP c4-standard-16 (Intel Xeon Platinum 8581C), Node.js 22_
