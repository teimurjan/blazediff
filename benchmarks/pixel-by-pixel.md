# Pixel By Pixel Benchmarks

Comparisons that compare pixels directly (RGBA or YIQ perceptual delta). Image decode is excluded except where the section title explicitly says "image IO included" (native binary, Python bindings).

## JavaScript (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~78.1%** performance improvement on average.

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
      <td>341.81ms</td>
      <td>40.81ms</td>
      <td>301.00ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>20.97ms</td>
      <td>3.25ms</td>
      <td>17.72ms</td>
      <td>84.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>324.42ms</td>
      <td>64.00ms</td>
      <td>260.42ms</td>
      <td>80.3%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>23.24ms</td>
      <td>3.44ms</td>
      <td>19.80ms</td>
      <td>85.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>420.72ms</td>
      <td>50.87ms</td>
      <td>369.84ms</td>
      <td>87.9%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>27.52ms</td>
      <td>5.54ms</td>
      <td>21.98ms</td>
      <td>79.9%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.16ms</td>
      <td>0.16ms</td>
      <td>1.00ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.49ms</td>
      <td>0.05ms</td>
      <td>0.44ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.60ms</td>
      <td>0.50ms</td>
      <td>1.10ms</td>
      <td>68.6%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.40ms</td>
      <td>0.05ms</td>
      <td>0.35ms</td>
      <td>88.4%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>8.83ms</td>
      <td>3.38ms</td>
      <td>5.45ms</td>
      <td>61.8%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.88ms</td>
      <td>0.25ms</td>
      <td>1.63ms</td>
      <td>86.6%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>11.01ms</td>
      <td>2.14ms</td>
      <td>8.87ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.59ms</td>
      <td>0.61ms</td>
      <td>3.98ms</td>
      <td>86.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>136.81ms</td>
      <td>16.40ms</td>
      <td>120.40ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>67.48ms</td>
      <td>13.41ms</td>
      <td>54.07ms</td>
      <td>80.1%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>479.21ms</td>
      <td>69.05ms</td>
      <td>410.17ms</td>
      <td>85.6%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>47.94ms</td>
      <td>12.62ms</td>
      <td>35.33ms</td>
      <td>73.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.57ms</td>
      <td>0.15ms</td>
      <td>0.42ms</td>
      <td>72.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.02ms</td>
      <td>0.13ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.20ms</td>
      <td>0.86ms</td>
      <td>1.34ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.08ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>86.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.34ms</td>
      <td>0.11ms</td>
      <td>0.23ms</td>
      <td>66.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.02ms</td>
      <td>0.13ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.09ms</td>
      <td>1.78ms</td>
      <td>2.31ms</td>
      <td>56.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.20ms</td>
      <td>0.03ms</td>
      <td>0.18ms</td>
      <td>87.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.17ms</td>
      <td>0.10ms</td>
      <td>0.06ms</td>
      <td>38.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>87.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.72ms</td>
      <td>0.48ms</td>
      <td>0.24ms</td>
      <td>33.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.25ms</td>
      <td>0.47ms</td>
      <td>0.78ms</td>
      <td>62.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.29ms</td>
      <td>0.03ms</td>
      <td>0.25ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>2.07ms</td>
      <td>0.26ms</td>
      <td>1.81ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.98ms</td>
      <td>0.29ms</td>
      <td>1.69ms</td>
      <td>85.2%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript with output buffer (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~65.0%** performance improvement on average.

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
      <td>401.44ms</td>
      <td>74.08ms</td>
      <td>327.35ms</td>
      <td>81.5%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>73.68ms</td>
      <td>34.65ms</td>
      <td>39.04ms</td>
      <td>53.0%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>386.89ms</td>
      <td>98.74ms</td>
      <td>288.15ms</td>
      <td>74.5%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>82.17ms</td>
      <td>38.46ms</td>
      <td>43.71ms</td>
      <td>53.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>508.77ms</td>
      <td>91.72ms</td>
      <td>417.05ms</td>
      <td>82.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>97.51ms</td>
      <td>47.03ms</td>
      <td>50.48ms</td>
      <td>51.8%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.66ms</td>
      <td>0.64ms</td>
      <td>2.01ms</td>
      <td>75.8%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.77ms</td>
      <td>0.55ms</td>
      <td>1.22ms</td>
      <td>69.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.82ms</td>
      <td>0.84ms</td>
      <td>1.98ms</td>
      <td>70.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.43ms</td>
      <td>0.35ms</td>
      <td>1.08ms</td>
      <td>75.7%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>14.34ms</td>
      <td>6.92ms</td>
      <td>7.42ms</td>
      <td>51.7%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>6.65ms</td>
      <td>3.63ms</td>
      <td>3.01ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>24.08ms</td>
      <td>4.61ms</td>
      <td>19.48ms</td>
      <td>80.9%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>15.26ms</td>
      <td>2.95ms</td>
      <td>12.31ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>338.64ms</td>
      <td>78.07ms</td>
      <td>260.57ms</td>
      <td>76.9%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>242.67ms</td>
      <td>71.58ms</td>
      <td>171.08ms</td>
      <td>70.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>621.13ms</td>
      <td>113.23ms</td>
      <td>507.90ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>170.33ms</td>
      <td>53.10ms</td>
      <td>117.23ms</td>
      <td>68.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>1.05ms</td>
      <td>0.28ms</td>
      <td>0.77ms</td>
      <td>72.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.53ms</td>
      <td>0.14ms</td>
      <td>0.39ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.37ms</td>
      <td>0.97ms</td>
      <td>1.40ms</td>
      <td>59.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.26ms</td>
      <td>0.11ms</td>
      <td>0.16ms</td>
      <td>58.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.79ms</td>
      <td>0.23ms</td>
      <td>0.56ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.53ms</td>
      <td>0.13ms</td>
      <td>0.40ms</td>
      <td>74.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.72ms</td>
      <td>2.11ms</td>
      <td>2.61ms</td>
      <td>55.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.72ms</td>
      <td>0.29ms</td>
      <td>0.43ms</td>
      <td>59.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.39ms</td>
      <td>0.24ms</td>
      <td>0.14ms</td>
      <td>36.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.26ms</td>
      <td>0.16ms</td>
      <td>0.11ms</td>
      <td>41.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.94ms</td>
      <td>0.60ms</td>
      <td>0.34ms</td>
      <td>35.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.26ms</td>
      <td>0.11ms</td>
      <td>0.15ms</td>
      <td>56.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>2.09ms</td>
      <td>0.85ms</td>
      <td>1.24ms</td>
      <td>59.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.01ms</td>
      <td>0.42ms</td>
      <td>0.59ms</td>
      <td>58.6%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>7.14ms</td>
      <td>1.61ms</td>
      <td>5.53ms</td>
      <td>77.4%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>6.98ms</td>
      <td>1.70ms</td>
      <td>5.28ms</td>
      <td>75.7%</td>
    </tr>
  </tbody>
</table>


## JavaScript, threshold 0 and anti-aliased pixels counted (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~78.0%** performance improvement on average.

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
      <td>366.14ms</td>
      <td>131.16ms</td>
      <td>234.98ms</td>
      <td>64.2%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>20.08ms</td>
      <td>2.56ms</td>
      <td>17.51ms</td>
      <td>87.2%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>321.16ms</td>
      <td>116.02ms</td>
      <td>205.15ms</td>
      <td>63.9%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>23.09ms</td>
      <td>2.68ms</td>
      <td>20.41ms</td>
      <td>88.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>447.49ms</td>
      <td>174.84ms</td>
      <td>272.65ms</td>
      <td>60.9%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>26.91ms</td>
      <td>4.06ms</td>
      <td>22.85ms</td>
      <td>84.9%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.10ms</td>
      <td>0.12ms</td>
      <td>0.98ms</td>
      <td>89.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.51ms</td>
      <td>0.05ms</td>
      <td>0.47ms</td>
      <td>90.7%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.17ms</td>
      <td>0.20ms</td>
      <td>0.97ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.39ms</td>
      <td>0.04ms</td>
      <td>0.35ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>4.31ms</td>
      <td>1.30ms</td>
      <td>3.01ms</td>
      <td>69.9%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.82ms</td>
      <td>0.45ms</td>
      <td>1.37ms</td>
      <td>75.4%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>10.11ms</td>
      <td>1.06ms</td>
      <td>9.06ms</td>
      <td>89.5%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.28ms</td>
      <td>0.48ms</td>
      <td>3.80ms</td>
      <td>88.7%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>125.87ms</td>
      <td>9.86ms</td>
      <td>116.01ms</td>
      <td>92.2%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>66.59ms</td>
      <td>8.03ms</td>
      <td>58.56ms</td>
      <td>87.9%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>531.67ms</td>
      <td>222.44ms</td>
      <td>309.23ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>46.88ms</td>
      <td>6.61ms</td>
      <td>40.27ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.55ms</td>
      <td>0.23ms</td>
      <td>0.32ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.01ms</td>
      <td>0.13ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>0.86ms</td>
      <td>0.37ms</td>
      <td>0.49ms</td>
      <td>57.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.28ms</td>
      <td>0.08ms</td>
      <td>0.20ms</td>
      <td>71.7%</td>
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
      <td>1.91ms</td>
      <td>0.90ms</td>
      <td>1.01ms</td>
      <td>52.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.20ms</td>
      <td>0.02ms</td>
      <td>0.18ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.15ms</td>
      <td>0.06ms</td>
      <td>0.09ms</td>
      <td>59.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.28ms</td>
      <td>0.18ms</td>
      <td>0.10ms</td>
      <td>35.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>0.70ms</td>
      <td>0.28ms</td>
      <td>0.43ms</td>
      <td>60.9%</td>
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
      <td>1.93ms</td>
      <td>0.23ms</td>
      <td>1.70ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>1.94ms</td>
      <td>0.23ms</td>
      <td>1.71ms</td>
      <td>88.3%</td>
    </tr>
  </tbody>
</table>

## JavaScript with output buffer, threshold 0 and anti-aliased pixels counted (`@blazediff/core` vs `pixelmatch`) (image IO excluded)

_50 iterations (5 warmup)_

> **~58.7%** performance improvement on average.

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
      <td>415.43ms</td>
      <td>272.49ms</td>
      <td>142.93ms</td>
      <td>34.4%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>71.64ms</td>
      <td>33.78ms</td>
      <td>37.86ms</td>
      <td>52.8%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>376.28ms</td>
      <td>249.69ms</td>
      <td>126.59ms</td>
      <td>33.6%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>81.15ms</td>
      <td>37.84ms</td>
      <td>43.31ms</td>
      <td>53.4%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>526.96ms</td>
      <td>353.16ms</td>
      <td>173.80ms</td>
      <td>33.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>96.20ms</td>
      <td>48.35ms</td>
      <td>47.84ms</td>
      <td>49.7%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>2.60ms</td>
      <td>0.60ms</td>
      <td>2.01ms</td>
      <td>77.1%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.74ms</td>
      <td>0.55ms</td>
      <td>1.19ms</td>
      <td>68.3%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>2.37ms</td>
      <td>0.54ms</td>
      <td>1.83ms</td>
      <td>77.1%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.48ms</td>
      <td>0.34ms</td>
      <td>1.14ms</td>
      <td>77.0%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>9.87ms</td>
      <td>4.15ms</td>
      <td>5.73ms</td>
      <td>58.0%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>6.74ms</td>
      <td>3.20ms</td>
      <td>3.54ms</td>
      <td>52.5%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>22.66ms</td>
      <td>3.65ms</td>
      <td>19.01ms</td>
      <td>83.9%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>16.20ms</td>
      <td>2.89ms</td>
      <td>13.31ms</td>
      <td>82.1%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>331.67ms</td>
      <td>69.11ms</td>
      <td>262.56ms</td>
      <td>79.2%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>243.33ms</td>
      <td>71.30ms</td>
      <td>172.04ms</td>
      <td>70.7%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>678.50ms</td>
      <td>431.03ms</td>
      <td>247.47ms</td>
      <td>36.5%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>167.99ms</td>
      <td>53.76ms</td>
      <td>114.22ms</td>
      <td>68.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.98ms</td>
      <td>0.46ms</td>
      <td>0.52ms</td>
      <td>53.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.53ms</td>
      <td>0.14ms</td>
      <td>0.40ms</td>
      <td>74.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>1.06ms</td>
      <td>0.70ms</td>
      <td>0.36ms</td>
      <td>33.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.26ms</td>
      <td>0.11ms</td>
      <td>0.15ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.73ms</td>
      <td>0.20ms</td>
      <td>0.53ms</td>
      <td>72.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.54ms</td>
      <td>0.14ms</td>
      <td>0.40ms</td>
      <td>74.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>2.48ms</td>
      <td>1.58ms</td>
      <td>0.89ms</td>
      <td>36.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.72ms</td>
      <td>0.29ms</td>
      <td>0.43ms</td>
      <td>60.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.37ms</td>
      <td>0.21ms</td>
      <td>0.16ms</td>
      <td>43.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.26ms</td>
      <td>0.16ms</td>
      <td>0.10ms</td>
      <td>38.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.49ms</td>
      <td>0.31ms</td>
      <td>0.17ms</td>
      <td>35.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.26ms</td>
      <td>0.11ms</td>
      <td>0.15ms</td>
      <td>58.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>1.54ms</td>
      <td>0.69ms</td>
      <td>0.85ms</td>
      <td>55.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>1.01ms</td>
      <td>0.41ms</td>
      <td>0.60ms</td>
      <td>59.4%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>7.10ms</td>
      <td>1.58ms</td>
      <td>5.52ms</td>
      <td>77.7%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>7.04ms</td>
      <td>1.68ms</td>
      <td>5.36ms</td>
      <td>76.1%</td>
    </tr>
  </tbody>
</table>
## WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`) (image IO excluded)

_25 iterations (5 warmup)_

> **~77.3%** performance improvement on average.

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
      <td>346.12ms</td>
      <td>34.73ms</td>
      <td>311.39ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>21.94ms</td>
      <td>4.33ms</td>
      <td>17.61ms</td>
      <td>80.3%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>338.34ms</td>
      <td>63.27ms</td>
      <td>275.07ms</td>
      <td>81.3%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>33.00ms</td>
      <td>5.21ms</td>
      <td>27.78ms</td>
      <td>84.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>423.70ms</td>
      <td>44.48ms</td>
      <td>379.22ms</td>
      <td>89.5%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>38.68ms</td>
      <td>5.34ms</td>
      <td>33.35ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>1.28ms</td>
      <td>0.18ms</td>
      <td>1.09ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>0.54ms</td>
      <td>0.07ms</td>
      <td>0.47ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>1.97ms</td>
      <td>0.55ms</td>
      <td>1.42ms</td>
      <td>72.1%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>0.41ms</td>
      <td>0.05ms</td>
      <td>0.36ms</td>
      <td>87.4%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>10.86ms</td>
      <td>5.94ms</td>
      <td>4.92ms</td>
      <td>45.3%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>1.94ms</td>
      <td>0.29ms</td>
      <td>1.65ms</td>
      <td>85.1%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>17.72ms</td>
      <td>3.53ms</td>
      <td>14.19ms</td>
      <td>80.1%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>4.98ms</td>
      <td>1.05ms</td>
      <td>3.93ms</td>
      <td>78.9%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>153.13ms</td>
      <td>35.20ms</td>
      <td>117.92ms</td>
      <td>77.0%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>71.84ms</td>
      <td>18.33ms</td>
      <td>53.51ms</td>
      <td>74.5%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>529.30ms</td>
      <td>65.49ms</td>
      <td>463.81ms</td>
      <td>87.6%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>74.86ms</td>
      <td>12.27ms</td>
      <td>62.60ms</td>
      <td>83.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>0.82ms</td>
      <td>0.10ms</td>
      <td>0.73ms</td>
      <td>88.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>0.15ms</td>
      <td>0.02ms</td>
      <td>0.13ms</td>
      <td>84.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>2.29ms</td>
      <td>1.37ms</td>
      <td>0.92ms</td>
      <td>40.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.08ms</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>83.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>0.39ms</td>
      <td>0.10ms</td>
      <td>0.28ms</td>
      <td>73.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>0.15ms</td>
      <td>0.02ms</td>
      <td>0.13ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>4.25ms</td>
      <td>2.84ms</td>
      <td>1.41ms</td>
      <td>33.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>0.21ms</td>
      <td>0.03ms</td>
      <td>0.18ms</td>
      <td>85.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.23ms</td>
      <td>0.05ms</td>
      <td>0.18ms</td>
      <td>77.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>80.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>0.96ms</td>
      <td>0.64ms</td>
      <td>0.32ms</td>
      <td>33.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>0.07ms</td>
      <td>0.01ms</td>
      <td>0.06ms</td>
      <td>82.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>7.82ms</td>
      <td>0.58ms</td>
      <td>7.24ms</td>
      <td>92.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.30ms</td>
      <td>0.04ms</td>
      <td>0.26ms</td>
      <td>86.5%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>2.01ms</td>
      <td>0.59ms</td>
      <td>1.42ms</td>
      <td>70.6%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>2.28ms</td>
      <td>0.55ms</td>
      <td>1.73ms</td>
      <td>75.9%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) (image IO included)

_25 runs (5 warmup)_

> **5.1-5.9x faster than odiff** on 4K images (6.8-7.5x with `BLAZEDIFF_PNG_ENABLED=1`).
> **~44.8%** performance improvement on average.

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
      <td>1185.48ms</td>
      <td>233.03ms</td>
      <td>174.99ms</td>
      <td>952.45ms</td>
      <td>80.3%</td>
      <td>1010.49ms</td>
      <td>85.2%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>278.67ms</td>
      <td>186.78ms</td>
      <td>129.49ms</td>
      <td>91.89ms</td>
      <td>33.0%</td>
      <td>149.17ms</td>
      <td>53.5%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1560.92ms</td>
      <td>299.62ms</td>
      <td>222.13ms</td>
      <td>1261.30ms</td>
      <td>80.8%</td>
      <td>1338.78ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>336.30ms</td>
      <td>226.12ms</td>
      <td>150.79ms</td>
      <td>110.18ms</td>
      <td>32.8%</td>
      <td>185.52ms</td>
      <td>55.2%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1739.76ms</td>
      <td>294.50ms</td>
      <td>233.27ms</td>
      <td>1445.26ms</td>
      <td>83.1%</td>
      <td>1506.50ms</td>
      <td>86.6%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>371.49ms</td>
      <td>230.02ms</td>
      <td>159.22ms</td>
      <td>141.47ms</td>
      <td>38.1%</td>
      <td>212.26ms</td>
      <td>57.1%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>3.43ms</td>
      <td>1.78ms</td>
      <td>1.58ms</td>
      <td>1.65ms</td>
      <td>48.2%</td>
      <td>1.85ms</td>
      <td>53.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>1.46ms</td>
      <td>0.91ms</td>
      <td>0.72ms</td>
      <td>0.55ms</td>
      <td>37.4%</td>
      <td>0.74ms</td>
      <td>50.9%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>3.58ms</td>
      <td>2.06ms</td>
      <td>1.67ms</td>
      <td>1.52ms</td>
      <td>42.6%</td>
      <td>1.91ms</td>
      <td>53.3%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>1.56ms</td>
      <td>1.03ms</td>
      <td>0.67ms</td>
      <td>0.53ms</td>
      <td>33.7%</td>
      <td>0.89ms</td>
      <td>57.1%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>45.93ms</td>
      <td>21.24ms</td>
      <td>16.27ms</td>
      <td>24.69ms</td>
      <td>53.8%</td>
      <td>29.67ms</td>
      <td>64.6%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>19.18ms</td>
      <td>14.31ms</td>
      <td>9.54ms</td>
      <td>4.86ms</td>
      <td>25.4%</td>
      <td>9.64ms</td>
      <td>50.3%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>24.16ms</td>
      <td>11.29ms</td>
      <td>10.58ms</td>
      <td>12.86ms</td>
      <td>53.3%</td>
      <td>13.58ms</td>
      <td>56.2%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>8.29ms</td>
      <td>4.46ms</td>
      <td>3.52ms</td>
      <td>3.83ms</td>
      <td>46.2%</td>
      <td>4.77ms</td>
      <td>57.6%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>1003.68ms</td>
      <td>361.01ms</td>
      <td>249.98ms</td>
      <td>642.67ms</td>
      <td>64.0%</td>
      <td>753.70ms</td>
      <td>75.1%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>535.29ms</td>
      <td>258.51ms</td>
      <td>151.15ms</td>
      <td>276.78ms</td>
      <td>51.7%</td>
      <td>384.14ms</td>
      <td>71.8%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>607.22ms</td>
      <td>154.81ms</td>
      <td>124.03ms</td>
      <td>452.41ms</td>
      <td>74.5%</td>
      <td>483.19ms</td>
      <td>79.6%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>118.39ms</td>
      <td>42.80ms</td>
      <td>34.50ms</td>
      <td>75.58ms</td>
      <td>63.8%</td>
      <td>83.89ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>3.38ms</td>
      <td>1.52ms</td>
      <td>1.01ms</td>
      <td>1.86ms</td>
      <td>55.0%</td>
      <td>2.37ms</td>
      <td>70.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>1.71ms</td>
      <td>1.15ms</td>
      <td>0.69ms</td>
      <td>0.56ms</td>
      <td>32.6%</td>
      <td>1.02ms</td>
      <td>59.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>3.37ms</td>
      <td>1.74ms</td>
      <td>1.41ms</td>
      <td>1.63ms</td>
      <td>48.4%</td>
      <td>1.96ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>0.79ms</td>
      <td>0.52ms</td>
      <td>0.23ms</td>
      <td>0.27ms</td>
      <td>34.3%</td>
      <td>0.56ms</td>
      <td>71.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.47ms</td>
      <td>1.22ms</td>
      <td>0.81ms</td>
      <td>1.25ms</td>
      <td>50.8%</td>
      <td>1.66ms</td>
      <td>67.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>1.48ms</td>
      <td>0.89ms</td>
      <td>0.52ms</td>
      <td>0.59ms</td>
      <td>39.8%</td>
      <td>0.96ms</td>
      <td>64.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>9.83ms</td>
      <td>4.65ms</td>
      <td>3.93ms</td>
      <td>5.18ms</td>
      <td>52.7%</td>
      <td>5.90ms</td>
      <td>60.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>2.68ms</td>
      <td>2.08ms</td>
      <td>1.22ms</td>
      <td>0.60ms</td>
      <td>22.4%</td>
      <td>1.47ms</td>
      <td>54.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>0.89ms</td>
      <td>0.80ms</td>
      <td>0.69ms</td>
      <td>0.09ms</td>
      <td>10.0%</td>
      <td>0.20ms</td>
      <td>22.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>0.80ms</td>
      <td>0.55ms</td>
      <td>0.42ms</td>
      <td>0.25ms</td>
      <td>31.6%</td>
      <td>0.38ms</td>
      <td>47.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>5.74ms</td>
      <td>1.85ms</td>
      <td>1.33ms</td>
      <td>3.90ms</td>
      <td>67.8%</td>
      <td>4.42ms</td>
      <td>76.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.06ms</td>
      <td>1.15ms</td>
      <td>0.48ms</td>
      <td>-0.09ms</td>
      <td>-8.1%</td>
      <td>0.58ms</td>
      <td>54.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.40ms</td>
      <td>1.58ms</td>
      <td>1.46ms</td>
      <td>1.82ms</td>
      <td>53.6%</td>
      <td>1.94ms</td>
      <td>57.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>0.68ms</td>
      <td>0.61ms</td>
      <td>0.33ms</td>
      <td>0.07ms</td>
      <td>9.6%</td>
      <td>0.35ms</td>
      <td>51.3%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>5.15ms</td>
      <td>3.18ms</td>
      <td>2.67ms</td>
      <td>1.96ms</td>
      <td>38.1%</td>
      <td>2.48ms</td>
      <td>48.1%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>5.48ms</td>
      <td>3.23ms</td>
      <td>2.55ms</td>
      <td>2.25ms</td>
      <td>41.0%</td>
      <td>2.93ms</td>
      <td>53.5%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on MacBook Pro M1 Max, Node.js 22_

## JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) (image IO included)

_25 runs (5 warmup)_

> **~65.2%** performance improvement on average.

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
      <td>1551.09ms</td>
      <td>228.59ms</td>
      <td>1322.50ms</td>
      <td>85.3%</td>
    </tr>
    <tr>
      <td>4k/1 (identical)</td>
      <td>521.15ms</td>
      <td>185.44ms</td>
      <td>335.71ms</td>
      <td>64.4%</td>
    </tr>
    <tr>
      <td>4k/2</td>
      <td>1309.87ms</td>
      <td>304.98ms</td>
      <td>1004.90ms</td>
      <td>76.7%</td>
    </tr>
    <tr>
      <td>4k/2 (identical)</td>
      <td>622.04ms</td>
      <td>225.74ms</td>
      <td>396.31ms</td>
      <td>63.7%</td>
    </tr>
    <tr>
      <td>4k/3</td>
      <td>1254.76ms</td>
      <td>301.68ms</td>
      <td>953.08ms</td>
      <td>76.0%</td>
    </tr>
    <tr>
      <td>4k/3 (identical)</td>
      <td>673.26ms</td>
      <td>230.69ms</td>
      <td>442.58ms</td>
      <td>65.7%</td>
    </tr>
    <tr>
      <td>blazediff/1</td>
      <td>4.25ms</td>
      <td>1.92ms</td>
      <td>2.33ms</td>
      <td>54.9%</td>
    </tr>
    <tr>
      <td>blazediff/1 (identical)</td>
      <td>4.08ms</td>
      <td>0.91ms</td>
      <td>3.17ms</td>
      <td>77.7%</td>
    </tr>
    <tr>
      <td>blazediff/2</td>
      <td>4.94ms</td>
      <td>2.20ms</td>
      <td>2.73ms</td>
      <td>55.4%</td>
    </tr>
    <tr>
      <td>blazediff/2 (identical)</td>
      <td>3.97ms</td>
      <td>1.08ms</td>
      <td>2.89ms</td>
      <td>72.8%</td>
    </tr>
    <tr>
      <td>blazediff/3</td>
      <td>44.03ms</td>
      <td>21.19ms</td>
      <td>22.84ms</td>
      <td>51.9%</td>
    </tr>
    <tr>
      <td>blazediff/3 (identical)</td>
      <td>39.11ms</td>
      <td>14.00ms</td>
      <td>25.11ms</td>
      <td>64.2%</td>
    </tr>
    <tr>
      <td>blazediff/4</td>
      <td>26.54ms</td>
      <td>11.35ms</td>
      <td>15.19ms</td>
      <td>57.2%</td>
    </tr>
    <tr>
      <td>blazediff/4 (identical)</td>
      <td>25.44ms</td>
      <td>4.58ms</td>
      <td>20.87ms</td>
      <td>82.0%</td>
    </tr>
    <tr>
      <td>page/1</td>
      <td>744.01ms</td>
      <td>346.85ms</td>
      <td>397.17ms</td>
      <td>53.4%</td>
    </tr>
    <tr>
      <td>page/1 (identical)</td>
      <td>752.62ms</td>
      <td>247.71ms</td>
      <td>504.91ms</td>
      <td>67.1%</td>
    </tr>
    <tr>
      <td>page/2</td>
      <td>1469.91ms</td>
      <td>149.83ms</td>
      <td>1320.08ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>page/2 (identical)</td>
      <td>368.23ms</td>
      <td>42.12ms</td>
      <td>326.11ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1</td>
      <td>5.27ms</td>
      <td>1.38ms</td>
      <td>3.89ms</td>
      <td>73.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1 (identical)</td>
      <td>3.82ms</td>
      <td>1.11ms</td>
      <td>2.70ms</td>
      <td>70.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2</td>
      <td>5.52ms</td>
      <td>1.82ms</td>
      <td>3.70ms</td>
      <td>67.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2 (identical)</td>
      <td>1.49ms</td>
      <td>0.53ms</td>
      <td>0.96ms</td>
      <td>64.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3</td>
      <td>2.49ms</td>
      <td>1.19ms</td>
      <td>1.30ms</td>
      <td>52.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/3 (identical)</td>
      <td>2.29ms</td>
      <td>0.89ms</td>
      <td>1.40ms</td>
      <td>60.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4</td>
      <td>11.03ms</td>
      <td>4.61ms</td>
      <td>6.42ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4 (identical)</td>
      <td>6.32ms</td>
      <td>2.08ms</td>
      <td>4.24ms</td>
      <td>67.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5</td>
      <td>1.37ms</td>
      <td>1.72ms</td>
      <td>-0.35ms</td>
      <td>-25.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5 (identical)</td>
      <td>1.89ms</td>
      <td>0.56ms</td>
      <td>1.33ms</td>
      <td>70.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6</td>
      <td>5.08ms</td>
      <td>1.80ms</td>
      <td>3.29ms</td>
      <td>64.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6 (identical)</td>
      <td>1.71ms</td>
      <td>0.82ms</td>
      <td>0.89ms</td>
      <td>52.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7</td>
      <td>3.46ms</td>
      <td>1.63ms</td>
      <td>1.84ms</td>
      <td>53.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7 (identical)</td>
      <td>4.13ms</td>
      <td>0.63ms</td>
      <td>3.50ms</td>
      <td>84.8%</td>
    </tr>
    <tr>
      <td>same/1</td>
      <td>15.79ms</td>
      <td>3.33ms</td>
      <td>12.46ms</td>
      <td>78.9%</td>
    </tr>
    <tr>
      <td>same/1 (identical)</td>
      <td>14.83ms</td>
      <td>3.28ms</td>
      <td>11.55ms</td>
      <td>77.9%</td>
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
