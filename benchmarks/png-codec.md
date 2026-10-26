# PNG Codec Benchmarks

A from-scratch PNG codec in Rust — `blazediff-png` — against [spng](https://libspng.org), image-rs (`png`), and [zune-png](https://github.com/etemesi254/zune-image). Decode and encode are timed (best-of, size-scaled iteration counts) over the full fixture corpus (36 PNGs, 342.8 MPx), single-threaded on Apple M1 Max. Lower is better.

Encode is measured at two settings so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly: **no compression** (stored deflate blocks) and **half compression** (half of each codec's own max deflate level — libdeflate 12 → 6, zlib 9 → 4).

**Speed here, correctness elsewhere.** These are timing numbers. Byte-identical *decode* parity with spng is verified separately on a large public-image corpus — Urban100, BSD100, Set14, Set5 (real high-res photos) plus the full [PngSuite](http://www.schaik.com/pngsuite/) (every format corner and the intentionally-malformed files), ~395 files — by the `corpus_differential` test: every file decodes byte-identically to spng at RGBA8 and at every `SPNG_FMT_*`, malformed files reject in lockstep, and every accepted image survives a blazediff encode → decode round-trip. Fetch the corpus with `crates/blazediff-png/scripts/fetch-corpus.sh` and run with `BLAZEDIFF_PNG_CORPUS` set; the `Benchmark PNG` GitHub workflow runs the benchmark and this verification.

## Decode

> blazediff decodes **~1.46×** faster than spng across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">spng</th>
      <th width="500">image-rs</th>
      <th width="500">zune</th>
      <th width="500">BlazeDiff vs spng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>137.66ms</td>
      <td>178.92ms</td>
      <td>152.01ms</td>
      <td>208.74ms</td>
      <td>23.1%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>124.61ms</td>
      <td>186.57ms</td>
      <td>144.58ms</td>
      <td>196.39ms</td>
      <td>33.2%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>158.28ms</td>
      <td>278.78ms</td>
      <td>193.89ms</td>
      <td>233.93ms</td>
      <td>43.2%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>159.90ms</td>
      <td>221.48ms</td>
      <td>195.78ms</td>
      <td>234.53ms</td>
      <td>27.8%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>160.07ms</td>
      <td>220.31ms</td>
      <td>194.08ms</td>
      <td>265.12ms</td>
      <td>27.3%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>159.97ms</td>
      <td>219.52ms</td>
      <td>199.62ms</td>
      <td>265.86ms</td>
      <td>27.1%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.08ms</td>
      <td>0.20ms</td>
      <td>0.07ms</td>
      <td>0.11ms</td>
      <td>57.8%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.20ms</td>
      <td>0.08ms</td>
      <td>0.11ms</td>
      <td>56.7%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.60ms</td>
      <td>0.69ms</td>
      <td>0.71ms</td>
      <td>1.01ms</td>
      <td>12.1%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.60ms</td>
      <td>0.70ms</td>
      <td>0.71ms</td>
      <td>1.01ms</td>
      <td>13.1%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.62ms</td>
      <td>0.83ms</td>
      <td>0.69ms</td>
      <td>0.93ms</td>
      <td>26.2%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.66ms</td>
      <td>0.85ms</td>
      <td>0.73ms</td>
      <td>1.02ms</td>
      <td>23.3%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>10.86ms</td>
      <td>13.38ms</td>
      <td>12.10ms</td>
      <td>17.55ms</td>
      <td>18.8%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>10.83ms</td>
      <td>13.25ms</td>
      <td>12.12ms</td>
      <td>17.45ms</td>
      <td>18.3%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>2.80ms</td>
      <td>3.41ms</td>
      <td>3.38ms</td>
      <td>4.43ms</td>
      <td>17.9%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>2.93ms</td>
      <td>3.48ms</td>
      <td>3.42ms</td>
      <td>4.49ms</td>
      <td>15.8%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>155.98ms</td>
      <td>236.30ms</td>
      <td>183.95ms</td>
      <td>255.09ms</td>
      <td>34.0%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>155.87ms</td>
      <td>234.33ms</td>
      <td>183.66ms</td>
      <td>246.19ms</td>
      <td>33.5%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>26.12ms</td>
      <td>36.51ms</td>
      <td>20.21ms</td>
      <td>47.56ms</td>
      <td>28.5%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>26.46ms</td>
      <td>35.71ms</td>
      <td>20.65ms</td>
      <td>58.02ms</td>
      <td>25.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.74ms</td>
      <td>0.95ms</td>
      <td>0.67ms</td>
      <td>1.07ms</td>
      <td>22.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.71ms</td>
      <td>0.53ms</td>
      <td>0.89ms</td>
      <td>23.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.11ms</td>
      <td>0.37ms</td>
      <td>0.12ms</td>
      <td>0.15ms</td>
      <td>69.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.11ms</td>
      <td>0.38ms</td>
      <td>0.12ms</td>
      <td>0.15ms</td>
      <td>70.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.50ms</td>
      <td>0.73ms</td>
      <td>0.47ms</td>
      <td>0.74ms</td>
      <td>31.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.50ms</td>
      <td>0.72ms</td>
      <td>0.46ms</td>
      <td>0.74ms</td>
      <td>30.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>1.08ms</td>
      <td>1.83ms</td>
      <td>1.36ms</td>
      <td>1.74ms</td>
      <td>41.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.31ms</td>
      <td>1.75ms</td>
      <td>1.36ms</td>
      <td>2.20ms</td>
      <td>25.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.29ms</td>
      <td>0.43ms</td>
      <td>0.28ms</td>
      <td>0.37ms</td>
      <td>32.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.29ms</td>
      <td>0.43ms</td>
      <td>0.27ms</td>
      <td>0.36ms</td>
      <td>32.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.35ms</td>
      <td>0.66ms</td>
      <td>0.38ms</td>
      <td>0.46ms</td>
      <td>46.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.60ms</td>
      <td>0.94ms</td>
      <td>0.51ms</td>
      <td>0.84ms</td>
      <td>35.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.19ms</td>
      <td>0.47ms</td>
      <td>0.18ms</td>
      <td>0.31ms</td>
      <td>60.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.18ms</td>
      <td>0.46ms</td>
      <td>0.19ms</td>
      <td>0.31ms</td>
      <td>61.2%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>2.09ms</td>
      <td>2.53ms</td>
      <td>2.63ms</td>
      <td>9.23ms</td>
      <td>17.4%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>2.09ms</td>
      <td>2.53ms</td>
      <td>2.64ms</td>
      <td>9.28ms</td>
      <td>17.3%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1305.96ms</strong></td>
      <td><strong>1901.31ms</strong></td>
      <td><strong>1534.62ms</strong></td>
      <td><strong>2088.41ms</strong></td>
      <td><strong>31.3%</strong></td>
    </tr>
  </tbody>
</table>

## Encode — No Compression

_Levels: blazediff stored · spng stored · image-rs stored · zune stored._

> blazediff encodes **~6.96×** faster than spng (stored) across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">spng</th>
      <th width="500">image-rs</th>
      <th width="500">zune</th>
      <th width="500">BlazeDiff vs spng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>4.35ms</td>
      <td>30.16ms</td>
      <td>27.64ms</td>
      <td>56.75ms</td>
      <td>85.6%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>4.83ms</td>
      <td>36.47ms</td>
      <td>25.84ms</td>
      <td>68.77ms</td>
      <td>86.8%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>4.64ms</td>
      <td>32.07ms</td>
      <td>25.19ms</td>
      <td>71.57ms</td>
      <td>85.5%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>4.63ms</td>
      <td>45.57ms</td>
      <td>31.10ms</td>
      <td>69.71ms</td>
      <td>89.8%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>5.63ms</td>
      <td>61.56ms</td>
      <td>60.05ms</td>
      <td>82.34ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>5.63ms</td>
      <td>61.71ms</td>
      <td>29.50ms</td>
      <td>72.25ms</td>
      <td>90.9%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.04ms</td>
      <td>0.04ms</td>
      <td>0.10ms</td>
      <td>78.6%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.04ms</td>
      <td>0.04ms</td>
      <td>0.10ms</td>
      <td>78.7%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.10ms</td>
      <td>0.48ms</td>
      <td>0.39ms</td>
      <td>1.18ms</td>
      <td>79.5%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.10ms</td>
      <td>0.42ms</td>
      <td>0.39ms</td>
      <td>1.14ms</td>
      <td>76.3%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.09ms</td>
      <td>0.36ms</td>
      <td>0.31ms</td>
      <td>0.94ms</td>
      <td>76.5%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.08ms</td>
      <td>0.37ms</td>
      <td>0.31ms</td>
      <td>0.94ms</td>
      <td>77.3%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>0.36ms</td>
      <td>2.00ms</td>
      <td>3.51ms</td>
      <td>4.86ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>0.36ms</td>
      <td>1.98ms</td>
      <td>2.28ms</td>
      <td>4.92ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>0.87ms</td>
      <td>5.35ms</td>
      <td>5.73ms</td>
      <td>11.38ms</td>
      <td>83.8%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>0.87ms</td>
      <td>6.12ms</td>
      <td>7.87ms</td>
      <td>13.12ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>16.84ms</td>
      <td>113.83ms</td>
      <td>117.06ms</td>
      <td>191.68ms</td>
      <td>85.2%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>22.59ms</td>
      <td>107.81ms</td>
      <td>92.34ms</td>
      <td>195.77ms</td>
      <td>79.0%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>12.32ms</td>
      <td>88.23ms</td>
      <td>109.19ms</td>
      <td>121.92ms</td>
      <td>86.0%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>12.08ms</td>
      <td>78.17ms</td>
      <td>53.95ms</td>
      <td>126.53ms</td>
      <td>84.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>80.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.13ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>77.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.06ms</td>
      <td>0.17ms</td>
      <td>80.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>81.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>81.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>81.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.04ms</td>
      <td>0.18ms</td>
      <td>0.15ms</td>
      <td>0.47ms</td>
      <td>75.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.05ms</td>
      <td>0.19ms</td>
      <td>0.16ms</td>
      <td>0.49ms</td>
      <td>76.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>81.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.18ms</td>
      <td>77.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.06ms</td>
      <td>0.24ms</td>
      <td>0.20ms</td>
      <td>0.65ms</td>
      <td>75.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.06ms</td>
      <td>0.27ms</td>
      <td>0.20ms</td>
      <td>0.65ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>0.40ms</td>
      <td>2.07ms</td>
      <td>3.45ms</td>
      <td>4.98ms</td>
      <td>80.6%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>0.40ms</td>
      <td>2.57ms</td>
      <td>3.96ms</td>
      <td>5.88ms</td>
      <td>84.6%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>97.60ms</strong></td>
      <td><strong>679.33ms</strong></td>
      <td><strong>601.57ms</strong></td>
      <td><strong>1111.46ms</strong></td>
      <td><strong>85.6%</strong></td>
    </tr>
  </tbody>
</table>

### Encode Size — No Compression

> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output — far larger than the rest.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">blazediff</th>
      <th width="500">spng</th>
      <th width="500">image-rs</th>
      <th width="500">zune</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>70008.5 KB</td>
      <td>70113.9 KB</td>
      <td>70008.5 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>70008.5 KB</td>
      <td>70113.9 KB</td>
      <td>70008.5 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>77985.6 KB</td>
      <td>78102.8 KB</td>
      <td>77985.6 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>77985.6 KB</td>
      <td>78102.8 KB</td>
      <td>77985.6 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>93761.1 KB</td>
      <td>93901.8 KB</td>
      <td>93761.1 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>93761.1 KB</td>
      <td>93901.8 KB</td>
      <td>93761.1 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>1686.4 KB</td>
      <td>1689.0 KB</td>
      <td>1686.4 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>1686.4 KB</td>
      <td>1689.0 KB</td>
      <td>1686.4 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>1372.2 KB</td>
      <td>1374.3 KB</td>
      <td>1372.2 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>1372.2 KB</td>
      <td>1374.3 KB</td>
      <td>1372.2 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>6372.0 KB</td>
      <td>6381.7 KB</td>
      <td>6372.0 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>6372.0 KB</td>
      <td>6381.7 KB</td>
      <td>6372.0 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>14792.1 KB</td>
      <td>14814.7 KB</td>
      <td>14792.1 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>14792.1 KB</td>
      <td>14814.7 KB</td>
      <td>14792.1 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>230305.6 KB</td>
      <td>230653.1 KB</td>
      <td>230305.6 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>230305.6 KB</td>
      <td>230653.1 KB</td>
      <td>230305.6 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>162963.6 KB</td>
      <td>163212.5 KB</td>
      <td>162963.6 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>162963.6 KB</td>
      <td>163212.5 KB</td>
      <td>162963.6 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>977.2 KB</td>
      <td>978.7 KB</td>
      <td>977.2 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>977.2 KB</td>
      <td>978.7 KB</td>
      <td>977.2 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>6789.5 KB</td>
      <td>6799.9 KB</td>
      <td>6789.5 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>6789.5 KB</td>
      <td>6799.9 KB</td>
      <td>6789.5 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td><strong>1339314.5 KB</strong></td>
      <td><strong>1341339.3 KB</strong></td>
      <td><strong>1339314.5 KB</strong></td>
      <td><strong>1341276.3 KB</strong></td>
    </tr>
    <tr>
      <td><strong>vs spng</strong></td>
      <td><strong>99.8%</strong></td>
      <td><strong>100.0%</strong></td>
      <td><strong>99.8%</strong></td>
      <td><strong>100.0%</strong></td>
    </tr>
  </tbody>
</table>

## Encode — Half Compression

_Levels: blazediff libdeflate 6 · spng zlib 4 · image-rs flate2 4 · zune stored._

> blazediff encodes **~3.83×** faster than spng (zlib 4) across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">spng</th>
      <th width="500">image-rs</th>
      <th width="500">zune</th>
      <th width="500">BlazeDiff vs spng</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>1152.10ms</td>
      <td>2801.98ms</td>
      <td>1082.60ms</td>
      <td>55.06ms</td>
      <td>58.9%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>959.27ms</td>
      <td>2506.19ms</td>
      <td>900.03ms</td>
      <td>62.97ms</td>
      <td>61.7%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>963.26ms</td>
      <td>3149.57ms</td>
      <td>1103.51ms</td>
      <td>71.73ms</td>
      <td>69.4%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>1010.77ms</td>
      <td>3052.04ms</td>
      <td>1117.07ms</td>
      <td>60.27ms</td>
      <td>66.9%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>1414.36ms</td>
      <td>3822.41ms</td>
      <td>1458.31ms</td>
      <td>83.12ms</td>
      <td>63.0%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>1407.18ms</td>
      <td>3875.33ms</td>
      <td>1465.77ms</td>
      <td>72.03ms</td>
      <td>63.7%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.36ms</td>
      <td>2.88ms</td>
      <td>0.37ms</td>
      <td>0.10ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.36ms</td>
      <td>2.88ms</td>
      <td>0.38ms</td>
      <td>0.10ms</td>
      <td>87.5%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>3.80ms</td>
      <td>33.99ms</td>
      <td>2.96ms</td>
      <td>1.14ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>3.83ms</td>
      <td>34.20ms</td>
      <td>2.96ms</td>
      <td>1.15ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>3.31ms</td>
      <td>27.83ms</td>
      <td>2.59ms</td>
      <td>0.93ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>3.34ms</td>
      <td>28.06ms</td>
      <td>2.68ms</td>
      <td>0.93ms</td>
      <td>88.1%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>37.88ms</td>
      <td>157.11ms</td>
      <td>37.58ms</td>
      <td>4.88ms</td>
      <td>75.9%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>36.72ms</td>
      <td>158.34ms</td>
      <td>37.02ms</td>
      <td>4.98ms</td>
      <td>76.8%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>29.16ms</td>
      <td>292.05ms</td>
      <td>20.48ms</td>
      <td>11.31ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>29.18ms</td>
      <td>293.81ms</td>
      <td>20.45ms</td>
      <td>12.70ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>821.68ms</td>
      <td>5189.75ms</td>
      <td>705.57ms</td>
      <td>192.25ms</td>
      <td>84.2%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>828.88ms</td>
      <td>5130.36ms</td>
      <td>695.03ms</td>
      <td>194.18ms</td>
      <td>83.8%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>628.72ms</td>
      <td>3670.91ms</td>
      <td>595.44ms</td>
      <td>133.24ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>618.76ms</td>
      <td>3685.92ms</td>
      <td>597.76ms</td>
      <td>130.55ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>1.65ms</td>
      <td>11.24ms</td>
      <td>1.72ms</td>
      <td>0.34ms</td>
      <td>85.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>1.65ms</td>
      <td>11.21ms</td>
      <td>1.73ms</td>
      <td>0.34ms</td>
      <td>85.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>2.45ms</td>
      <td>8.91ms</td>
      <td>3.20ms</td>
      <td>0.17ms</td>
      <td>72.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>2.49ms</td>
      <td>9.20ms</td>
      <td>3.31ms</td>
      <td>0.18ms</td>
      <td>73.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>1.34ms</td>
      <td>10.42ms</td>
      <td>1.16ms</td>
      <td>0.34ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>1.32ms</td>
      <td>10.43ms</td>
      <td>1.16ms</td>
      <td>0.34ms</td>
      <td>87.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>6.97ms</td>
      <td>24.69ms</td>
      <td>8.84ms</td>
      <td>0.47ms</td>
      <td>71.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>7.05ms</td>
      <td>25.16ms</td>
      <td>9.30ms</td>
      <td>0.47ms</td>
      <td>72.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.61ms</td>
      <td>5.07ms</td>
      <td>0.58ms</td>
      <td>0.17ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.61ms</td>
      <td>5.06ms</td>
      <td>0.58ms</td>
      <td>0.17ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>2.11ms</td>
      <td>7.23ms</td>
      <td>2.44ms</td>
      <td>0.18ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>2.03ms</td>
      <td>6.88ms</td>
      <td>2.14ms</td>
      <td>0.17ms</td>
      <td>70.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>3.77ms</td>
      <td>22.39ms</td>
      <td>4.05ms</td>
      <td>0.64ms</td>
      <td>83.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>3.77ms</td>
      <td>22.07ms</td>
      <td>4.03ms</td>
      <td>0.66ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>15.40ms</td>
      <td>137.09ms</td>
      <td>12.25ms</td>
      <td>5.18ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>15.70ms</td>
      <td>139.98ms</td>
      <td>12.38ms</td>
      <td>5.86ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>10021.83ms</strong></td>
      <td><strong>38372.64ms</strong></td>
      <td><strong>9917.43ms</strong></td>
      <td><strong>1109.28ms</strong></td>
      <td><strong>73.9%</strong></td>
    </tr>
  </tbody>
</table>

### Encode Size — Half Compression

> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output — far larger than the rest.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">blazediff</th>
      <th width="500">spng</th>
      <th width="500">image-rs</th>
      <th width="500">zune</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>21101.4 KB</td>
      <td>21854.4 KB</td>
      <td>22052.3 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17651.2 KB</td>
      <td>18677.4 KB</td>
      <td>18347.8 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>26682.0 KB</td>
      <td>27721.7 KB</td>
      <td>27255.9 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>27245.4 KB</td>
      <td>28215.9 KB</td>
      <td>27832.4 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>32854.0 KB</td>
      <td>35811.5 KB</td>
      <td>33914.6 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>32367.2 KB</td>
      <td>35368.2 KB</td>
      <td>33383.8 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>2.8 KB</td>
      <td>2.9 KB</td>
      <td>3.0 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>2.8 KB</td>
      <td>3.0 KB</td>
      <td>3.0 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>30.8 KB</td>
      <td>35.4 KB</td>
      <td>30.2 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>30.9 KB</td>
      <td>35.4 KB</td>
      <td>30.3 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>31.5 KB</td>
      <td>38.1 KB</td>
      <td>30.1 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>32.8 KB</td>
      <td>39.8 KB</td>
      <td>31.5 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>815.5 KB</td>
      <td>877.0 KB</td>
      <td>835.0 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>792.2 KB</td>
      <td>853.3 KB</td>
      <td>812.1 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>98.7 KB</td>
      <td>114.0 KB</td>
      <td>100.5 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>98.3 KB</td>
      <td>114.1 KB</td>
      <td>100.4 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>11324.3 KB</td>
      <td>12237.3 KB</td>
      <td>11321.4 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>11315.0 KB</td>
      <td>12227.2 KB</td>
      <td>11313.6 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>10595.2 KB</td>
      <td>11285.2 KB</td>
      <td>10674.2 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>10614.5 KB</td>
      <td>11291.1 KB</td>
      <td>10702.0 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>31.8 KB</td>
      <td>32.2 KB</td>
      <td>33.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>31.9 KB</td>
      <td>32.2 KB</td>
      <td>33.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>90.8 KB</td>
      <td>96.9 KB</td>
      <td>91.0 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>94.4 KB</td>
      <td>99.9 KB</td>
      <td>94.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>13.9 KB</td>
      <td>14.7 KB</td>
      <td>13.8 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>13.7 KB</td>
      <td>14.3 KB</td>
      <td>13.5 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>240.1 KB</td>
      <td>254.1 KB</td>
      <td>241.3 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>251.0 KB</td>
      <td>268.1 KB</td>
      <td>251.9 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>3.0 KB</td>
      <td>3.3 KB</td>
      <td>3.1 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>3.2 KB</td>
      <td>3.3 KB</td>
      <td>3.2 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>44.4 KB</td>
      <td>50.7 KB</td>
      <td>48.5 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>32.0 KB</td>
      <td>37.9 KB</td>
      <td>36.5 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>88.2 KB</td>
      <td>96.1 KB</td>
      <td>87.4 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>87.3 KB</td>
      <td>94.8 KB</td>
      <td>86.5 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>124.9 KB</td>
      <td>140.3 KB</td>
      <td>126.7 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>124.9 KB</td>
      <td>140.3 KB</td>
      <td>126.7 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td><strong>204962.2 KB</strong></td>
      <td><strong>218181.8 KB</strong></td>
      <td><strong>210065.0 KB</strong></td>
      <td><strong>1341276.3 KB</strong></td>
    </tr>
    <tr>
      <td><strong>vs spng</strong></td>
      <td><strong>93.9%</strong></td>
      <td><strong>100.0%</strong></td>
      <td><strong>96.3%</strong></td>
      <td><strong>614.8%</strong></td>
    </tr>
  </tbody>
</table>

## WebAssembly

`@blazediff/codec-png-wasm` against [zune-png](https://github.com/etemesi254/zune-image) compiled to wasm (`apps/image-benchmark/zune-png-wasm`) and [jSquash](https://github.com/jamsinclair/jSquash) (`@jsquash/png`, the Rust `png` crate via Squoosh), run in Node v22.14.0 (V8) on Apple M1 Max. Same method as above. Each timed call copies its input into wasm memory and its output back out. Refresh with `pnpm benchmark png-wasm`.

### Decode

> blazediff decodes **~2.69×** faster than jSquash across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">zune-png</th>
      <th width="500">jSquash</th>
      <th width="500">BlazeDiff vs jSquash</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>185.27ms</td>
      <td>222.90ms</td>
      <td>397.80ms</td>
      <td>53.4%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>163.47ms</td>
      <td>205.72ms</td>
      <td>378.03ms</td>
      <td>56.8%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>223.80ms</td>
      <td>273.85ms</td>
      <td>545.24ms</td>
      <td>59.0%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>231.70ms</td>
      <td>268.83ms</td>
      <td>546.98ms</td>
      <td>57.6%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>245.23ms</td>
      <td>310.26ms</td>
      <td>568.71ms</td>
      <td>56.9%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>242.07ms</td>
      <td>308.84ms</td>
      <td>578.82ms</td>
      <td>58.2%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.10ms</td>
      <td>0.12ms</td>
      <td>0.36ms</td>
      <td>71.1%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.11ms</td>
      <td>0.11ms</td>
      <td>0.36ms</td>
      <td>69.9%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.85ms</td>
      <td>0.97ms</td>
      <td>4.32ms</td>
      <td>80.3%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.80ms</td>
      <td>1.00ms</td>
      <td>4.35ms</td>
      <td>81.7%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.74ms</td>
      <td>0.88ms</td>
      <td>3.66ms</td>
      <td>79.7%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.80ms</td>
      <td>0.97ms</td>
      <td>3.71ms</td>
      <td>78.6%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>13.48ms</td>
      <td>16.19ms</td>
      <td>36.66ms</td>
      <td>63.2%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>13.52ms</td>
      <td>16.08ms</td>
      <td>35.38ms</td>
      <td>61.8%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>4.40ms</td>
      <td>4.74ms</td>
      <td>31.96ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>4.51ms</td>
      <td>4.78ms</td>
      <td>31.67ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>210.43ms</td>
      <td>277.50ms</td>
      <td>625.52ms</td>
      <td>66.4%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>217.45ms</td>
      <td>262.05ms</td>
      <td>609.95ms</td>
      <td>64.3%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>47.61ms</td>
      <td>53.70ms</td>
      <td>286.25ms</td>
      <td>83.4%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>46.96ms</td>
      <td>51.86ms</td>
      <td>282.66ms</td>
      <td>83.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.77ms</td>
      <td>0.94ms</td>
      <td>1.82ms</td>
      <td>57.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.61ms</td>
      <td>0.81ms</td>
      <td>1.81ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.20ms</td>
      <td>0.23ms</td>
      <td>0.77ms</td>
      <td>73.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.21ms</td>
      <td>0.23ms</td>
      <td>0.78ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.58ms</td>
      <td>0.67ms</td>
      <td>1.52ms</td>
      <td>61.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.67ms</td>
      <td>1.52ms</td>
      <td>63.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>1.78ms</td>
      <td>2.21ms</td>
      <td>4.31ms</td>
      <td>58.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.99ms</td>
      <td>2.37ms</td>
      <td>4.68ms</td>
      <td>57.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.56ms</td>
      <td>0.59ms</td>
      <td>1.03ms</td>
      <td>45.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.56ms</td>
      <td>0.55ms</td>
      <td>0.75ms</td>
      <td>24.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.68ms</td>
      <td>0.67ms</td>
      <td>1.32ms</td>
      <td>48.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.90ms</td>
      <td>0.99ms</td>
      <td>1.37ms</td>
      <td>34.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.34ms</td>
      <td>0.39ms</td>
      <td>1.90ms</td>
      <td>81.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.34ms</td>
      <td>0.41ms</td>
      <td>1.88ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>3.54ms</td>
      <td>7.37ms</td>
      <td>14.08ms</td>
      <td>74.9%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>3.56ms</td>
      <td>7.43ms</td>
      <td>14.03ms</td>
      <td>74.7%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1870.48ms</strong></td>
      <td><strong>2307.87ms</strong></td>
      <td><strong>5025.95ms</strong></td>
      <td><strong>62.8%</strong></td>
    </tr>
  </tbody>
</table>

### Encode — No Compression

_Levels: blazediff stored · zune-png stored._

> blazediff encodes **~1.82×** faster than zune-png (stored) across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">zune-png</th>
      <th width="500">BlazeDiff vs zune-png</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>44.55ms</td>
      <td>71.50ms</td>
      <td>37.7%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>37.01ms</td>
      <td>66.31ms</td>
      <td>44.2%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>51.72ms</td>
      <td>81.47ms</td>
      <td>36.5%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>42.54ms</td>
      <td>74.70ms</td>
      <td>43.1%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>52.96ms</td>
      <td>91.61ms</td>
      <td>42.2%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>50.30ms</td>
      <td>94.01ms</td>
      <td>46.5%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.14ms</td>
      <td>37.6%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.14ms</td>
      <td>36.1%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.94ms</td>
      <td>1.50ms</td>
      <td>36.9%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.91ms</td>
      <td>1.50ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.75ms</td>
      <td>1.19ms</td>
      <td>37.1%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.77ms</td>
      <td>1.22ms</td>
      <td>37.0%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>3.35ms</td>
      <td>6.20ms</td>
      <td>45.9%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>3.42ms</td>
      <td>5.85ms</td>
      <td>41.6%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>7.90ms</td>
      <td>13.80ms</td>
      <td>42.7%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>7.97ms</td>
      <td>13.63ms</td>
      <td>41.5%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>129.48ms</td>
      <td>257.85ms</td>
      <td>49.8%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>131.27ms</td>
      <td>263.75ms</td>
      <td>50.2%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>89.78ms</td>
      <td>153.34ms</td>
      <td>41.4%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>88.88ms</td>
      <td>156.25ms</td>
      <td>43.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.45ms</td>
      <td>38.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.47ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.24ms</td>
      <td>39.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.23ms</td>
      <td>37.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.45ms</td>
      <td>37.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.27ms</td>
      <td>0.46ms</td>
      <td>39.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.38ms</td>
      <td>0.61ms</td>
      <td>38.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.39ms</td>
      <td>0.63ms</td>
      <td>38.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.24ms</td>
      <td>38.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.23ms</td>
      <td>37.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>37.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>38.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.52ms</td>
      <td>0.85ms</td>
      <td>39.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.52ms</td>
      <td>0.86ms</td>
      <td>40.3%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>3.58ms</td>
      <td>6.16ms</td>
      <td>41.8%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>3.60ms</td>
      <td>6.16ms</td>
      <td>41.6%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>755.64ms</strong></td>
      <td><strong>1374.44ms</strong></td>
      <td><strong>45.0%</strong></td>
    </tr>
  </tbody>
</table>

#### Encode Size — No Compression

> Output bytes per codec; the final row is each codec's total as a percentage of zune-png's. zune-png has no compressed mode, so it always writes stored output — far larger than the rest.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">blazediff</th>
      <th width="500">zune-png</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>70008.5 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>70008.5 KB</td>
      <td>70111.1 KB</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>77985.6 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>77985.6 KB</td>
      <td>78099.8 KB</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>93761.1 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>93761.1 KB</td>
      <td>93898.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>144.3 KB</td>
      <td>144.5 KB</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>1686.4 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>1686.4 KB</td>
      <td>1688.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>1372.2 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>1372.2 KB</td>
      <td>1374.2 KB</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>6372.0 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>6372.0 KB</td>
      <td>6381.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>14792.1 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>14792.1 KB</td>
      <td>14813.8 KB</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>230305.6 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>230305.6 KB</td>
      <td>230643.0 KB</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>162963.6 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>162963.6 KB</td>
      <td>163202.3 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>512.4 KB</td>
      <td>513.1 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>705.4 KB</td>
      <td>706.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>256.3 KB</td>
      <td>256.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>977.2 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>977.2 KB</td>
      <td>978.6 KB</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>6789.5 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>6789.5 KB</td>
      <td>6799.5 KB</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td><strong>1339314.5 KB</strong></td>
      <td><strong>1341276.3 KB</strong></td>
    </tr>
    <tr>
      <td><strong>vs zune-png</strong></td>
      <td><strong>99.9%</strong></td>
      <td><strong>100.0%</strong></td>
    </tr>
  </tbody>
</table>

### Encode — Default Settings

_Levels: blazediff fdeflate, adaptive filter · zune-png stored · jSquash png crate default._

> blazediff encodes **~1.16×** faster than jSquash (each codec's default) across the corpus.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">MPx</th>
      <th width="500">blazediff</th>
      <th width="500">zune-png</th>
      <th width="500">jSquash</th>
      <th width="500">BlazeDiff vs jSquash</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>17.9</td>
      <td>235.80ms</td>
      <td>65.81ms</td>
      <td>286.28ms</td>
      <td>17.6%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>225.35ms</td>
      <td>70.29ms</td>
      <td>275.77ms</td>
      <td>18.3%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>234.34ms</td>
      <td>73.03ms</td>
      <td>308.31ms</td>
      <td>24.0%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>239.92ms</td>
      <td>74.41ms</td>
      <td>303.07ms</td>
      <td>20.8%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>303.96ms</td>
      <td>87.89ms</td>
      <td>384.38ms</td>
      <td>20.9%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>303.94ms</td>
      <td>89.58ms</td>
      <td>388.25ms</td>
      <td>21.7%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.16ms</td>
      <td>0.14ms</td>
      <td>0.23ms</td>
      <td>28.3%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.16ms</td>
      <td>0.14ms</td>
      <td>0.23ms</td>
      <td>27.5%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>3.48ms</td>
      <td>1.50ms</td>
      <td>3.17ms</td>
      <td>-9.5%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>3.44ms</td>
      <td>1.52ms</td>
      <td>3.18ms</td>
      <td>-8.3%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>1.38ms</td>
      <td>1.20ms</td>
      <td>2.12ms</td>
      <td>34.8%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>1.40ms</td>
      <td>1.19ms</td>
      <td>2.14ms</td>
      <td>34.6%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>17.94ms</td>
      <td>6.10ms</td>
      <td>18.34ms</td>
      <td>2.2%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>17.72ms</td>
      <td>5.82ms</td>
      <td>17.91ms</td>
      <td>1.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>23.73ms</td>
      <td>13.54ms</td>
      <td>19.57ms</td>
      <td>-21.3%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>23.81ms</td>
      <td>13.54ms</td>
      <td>19.55ms</td>
      <td>-21.8%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>484.51ms</td>
      <td>232.90ms</td>
      <td>412.93ms</td>
      <td>-17.3%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>480.00ms</td>
      <td>234.40ms</td>
      <td>404.29ms</td>
      <td>-18.7%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>207.30ms</td>
      <td>157.35ms</td>
      <td>323.10ms</td>
      <td>35.8%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>191.22ms</td>
      <td>156.01ms</td>
      <td>321.35ms</td>
      <td>40.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>1.14ms</td>
      <td>0.44ms</td>
      <td>0.93ms</td>
      <td>-22.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>1.19ms</td>
      <td>0.47ms</td>
      <td>0.96ms</td>
      <td>-24.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.50ms</td>
      <td>0.24ms</td>
      <td>0.91ms</td>
      <td>45.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.49ms</td>
      <td>0.23ms</td>
      <td>0.89ms</td>
      <td>45.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>1.12ms</td>
      <td>0.45ms</td>
      <td>0.81ms</td>
      <td>-37.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>1.12ms</td>
      <td>0.46ms</td>
      <td>0.82ms</td>
      <td>-37.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>2.28ms</td>
      <td>0.62ms</td>
      <td>2.62ms</td>
      <td>13.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>2.28ms</td>
      <td>0.64ms</td>
      <td>2.75ms</td>
      <td>17.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.60ms</td>
      <td>0.24ms</td>
      <td>0.52ms</td>
      <td>-14.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.57ms</td>
      <td>0.23ms</td>
      <td>0.52ms</td>
      <td>-10.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.80ms</td>
      <td>0.22ms</td>
      <td>0.80ms</td>
      <td>0.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.79ms</td>
      <td>0.22ms</td>
      <td>0.74ms</td>
      <td>-6.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>1.25ms</td>
      <td>0.85ms</td>
      <td>2.04ms</td>
      <td>38.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>1.22ms</td>
      <td>0.86ms</td>
      <td>2.06ms</td>
      <td>40.8%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>12.78ms</td>
      <td>6.16ms</td>
      <td>10.73ms</td>
      <td>-19.1%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>12.82ms</td>
      <td>6.16ms</td>
      <td>10.69ms</td>
      <td>-19.9%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>3040.51ms</strong></td>
      <td><strong>1304.85ms</strong></td>
      <td><strong>3532.95ms</strong></td>
      <td><strong>13.9%</strong></td>
    </tr>
  </tbody>
</table>

#### Encode Size — Default Settings

> Output bytes per codec; the final row is each codec's total as a percentage of jSquash's. zune-png has no compressed mode, so it always writes stored output — far larger than the rest.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">blazediff</th>
      <th width="500">zune-png</th>
      <th width="500">jSquash</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>4k/1a.png</td>
      <td>20350.6 KB</td>
      <td>70111.1 KB</td>
      <td>26447.3 KB</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>18833.1 KB</td>
      <td>70111.1 KB</td>
      <td>25134.3 KB</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>28706.7 KB</td>
      <td>78099.8 KB</td>
      <td>38017.8 KB</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>28730.4 KB</td>
      <td>78099.8 KB</td>
      <td>38035.9 KB</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>36327.3 KB</td>
      <td>93898.5 KB</td>
      <td>44223.4 KB</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>35895.5 KB</td>
      <td>93898.5 KB</td>
      <td>43777.6 KB</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>2.3 KB</td>
      <td>144.5 KB</td>
      <td>4.5 KB</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>2.2 KB</td>
      <td>144.5 KB</td>
      <td>4.5 KB</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>67.9 KB</td>
      <td>1688.8 KB</td>
      <td>152.5 KB</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>68.1 KB</td>
      <td>1688.8 KB</td>
      <td>152.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>19.6 KB</td>
      <td>1374.2 KB</td>
      <td>77.8 KB</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>20.2 KB</td>
      <td>1374.2 KB</td>
      <td>79.9 KB</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>996.6 KB</td>
      <td>6381.3 KB</td>
      <td>1257.9 KB</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>978.8 KB</td>
      <td>6381.3 KB</td>
      <td>1238.6 KB</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>307.2 KB</td>
      <td>14813.8 KB</td>
      <td>232.3 KB</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>328.9 KB</td>
      <td>14813.8 KB</td>
      <td>236.9 KB</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>12697.4 KB</td>
      <td>230643.0 KB</td>
      <td>17097.6 KB</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>12686.4 KB</td>
      <td>230643.0 KB</td>
      <td>17085.0 KB</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>6641.8 KB</td>
      <td>163202.3 KB</td>
      <td>17253.3 KB</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>6625.9 KB</td>
      <td>163202.3 KB</td>
      <td>17272.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>37.0 KB</td>
      <td>513.1 KB</td>
      <td>40.0 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>36.9 KB</td>
      <td>513.1 KB</td>
      <td>40.0 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>44.9 KB</td>
      <td>256.7 KB</td>
      <td>122.3 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>46.0 KB</td>
      <td>256.7 KB</td>
      <td>124.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>27.8 KB</td>
      <td>513.1 KB</td>
      <td>33.6 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>27.9 KB</td>
      <td>513.1 KB</td>
      <td>33.7 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>280.8 KB</td>
      <td>706.5 KB</td>
      <td>317.8 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>299.9 KB</td>
      <td>706.5 KB</td>
      <td>338.2 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>14.6 KB</td>
      <td>256.7 KB</td>
      <td>43.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>13.9 KB</td>
      <td>256.7 KB</td>
      <td>42.6 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>82.7 KB</td>
      <td>256.7 KB</td>
      <td>105.0 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>65.5 KB</td>
      <td>256.7 KB</td>
      <td>87.5 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>51.2 KB</td>
      <td>978.6 KB</td>
      <td>144.8 KB</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>50.5 KB</td>
      <td>978.6 KB</td>
      <td>143.2 KB</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>206.3 KB</td>
      <td>6799.5 KB</td>
      <td>306.2 KB</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>206.3 KB</td>
      <td>6799.5 KB</td>
      <td>306.2 KB</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td><strong>211779.1 KB</strong></td>
      <td><strong>1341276.3 KB</strong></td>
      <td><strong>290011.7 KB</strong></td>
    </tr>
    <tr>
      <td><strong>vs jSquash</strong></td>
      <td><strong>73.0%</strong></td>
      <td><strong>462.5%</strong></td>
      <td><strong>100.0%</strong></td>
    </tr>
  </tbody>
</table>
