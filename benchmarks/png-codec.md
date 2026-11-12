# PNG Codec Benchmarks

A from-scratch PNG codec in Rust (`blazediff-png`) against [spng](https://libspng.org), image-rs (`png`), and [zune-png](https://github.com/etemesi254/zune-image). Decode and encode are timed (best-of, size-scaled iteration counts) over the full fixture corpus (36 PNGs, 342.8 MPx), single-threaded on INTEL(R) XEON(R) PLATINUM 8581C CPU @ 2.30GHz. Lower is better.

Encode is measured at two settings so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly: **no compression** (stored deflate blocks) and **half compression** (half of each codec's own max deflate level: libdeflate 12 → 6, zlib 9 → 4).

**Speed here, correctness elsewhere.** These are timing numbers. Byte-identical *decode* parity with spng is verified separately by the `corpus_differential` test on ~395 public images: Urban100, BSD100, Set14 and Set5 (real high-res photos) plus the full [PngSuite](http://www.schaik.com/pngsuite/) (every format corner and the intentionally-malformed files). Every file decodes byte-identically to spng at RGBA8 and at every `SPNG_FMT_*`, malformed files reject in lockstep, and every accepted image survives a blazediff encode → decode round-trip. Fetch the corpus with `crates/blazediff-png/scripts/fetch-corpus.sh` and run with `BLAZEDIFF_PNG_CORPUS` set; the `Benchmark PNG` GitHub workflow runs the benchmark and this verification.

## Decode

> blazediff decodes **~1.61×** faster than spng across the corpus.

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
      <td>157.38ms</td>
      <td>271.78ms</td>
      <td>156.74ms</td>
      <td>200.20ms</td>
      <td>42.1%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>147.21ms</td>
      <td>246.48ms</td>
      <td>150.96ms</td>
      <td>178.51ms</td>
      <td>40.3%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>179.81ms</td>
      <td>327.50ms</td>
      <td>206.83ms</td>
      <td>233.85ms</td>
      <td>45.1%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>194.53ms</td>
      <td>335.47ms</td>
      <td>209.46ms</td>
      <td>235.75ms</td>
      <td>42.0%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>211.32ms</td>
      <td>379.99ms</td>
      <td>219.37ms</td>
      <td>293.66ms</td>
      <td>44.4%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>203.06ms</td>
      <td>376.85ms</td>
      <td>213.98ms</td>
      <td>292.49ms</td>
      <td>46.1%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.06ms</td>
      <td>0.13ms</td>
      <td>0.06ms</td>
      <td>0.06ms</td>
      <td>55.0%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.06ms</td>
      <td>0.14ms</td>
      <td>0.07ms</td>
      <td>0.07ms</td>
      <td>55.2%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.49ms</td>
      <td>0.79ms</td>
      <td>0.65ms</td>
      <td>0.66ms</td>
      <td>38.0%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.48ms</td>
      <td>0.79ms</td>
      <td>0.63ms</td>
      <td>0.67ms</td>
      <td>39.2%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.45ms</td>
      <td>0.79ms</td>
      <td>0.58ms</td>
      <td>0.62ms</td>
      <td>43.1%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.48ms</td>
      <td>0.84ms</td>
      <td>0.62ms</td>
      <td>0.65ms</td>
      <td>42.7%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>8.07ms</td>
      <td>16.58ms</td>
      <td>10.59ms</td>
      <td>11.15ms</td>
      <td>51.3%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>8.02ms</td>
      <td>16.43ms</td>
      <td>10.71ms</td>
      <td>11.17ms</td>
      <td>51.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>2.87ms</td>
      <td>3.99ms</td>
      <td>3.63ms</td>
      <td>3.92ms</td>
      <td>27.9%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>2.89ms</td>
      <td>4.01ms</td>
      <td>3.66ms</td>
      <td>3.94ms</td>
      <td>27.9%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>282.77ms</td>
      <td>356.29ms</td>
      <td>221.38ms</td>
      <td>329.32ms</td>
      <td>20.6%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>277.89ms</td>
      <td>353.38ms</td>
      <td>221.16ms</td>
      <td>318.99ms</td>
      <td>21.4%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>80.41ms</td>
      <td>130.30ms</td>
      <td>23.36ms</td>
      <td>106.61ms</td>
      <td>38.3%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>80.49ms</td>
      <td>131.27ms</td>
      <td>22.79ms</td>
      <td>103.41ms</td>
      <td>38.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.45ms</td>
      <td>0.84ms</td>
      <td>0.51ms</td>
      <td>0.57ms</td>
      <td>46.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.34ms</td>
      <td>0.79ms</td>
      <td>0.42ms</td>
      <td>0.47ms</td>
      <td>56.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.10ms</td>
      <td>0.35ms</td>
      <td>0.11ms</td>
      <td>0.15ms</td>
      <td>72.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.10ms</td>
      <td>0.35ms</td>
      <td>0.10ms</td>
      <td>0.15ms</td>
      <td>72.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.32ms</td>
      <td>0.63ms</td>
      <td>0.36ms</td>
      <td>0.41ms</td>
      <td>48.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.32ms</td>
      <td>0.65ms</td>
      <td>0.37ms</td>
      <td>0.42ms</td>
      <td>50.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.96ms</td>
      <td>2.46ms</td>
      <td>1.30ms</td>
      <td>1.63ms</td>
      <td>61.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.15ms</td>
      <td>2.52ms</td>
      <td>1.19ms</td>
      <td>1.35ms</td>
      <td>54.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.26ms</td>
      <td>0.53ms</td>
      <td>0.24ms</td>
      <td>0.26ms</td>
      <td>50.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.26ms</td>
      <td>0.47ms</td>
      <td>0.24ms</td>
      <td>0.26ms</td>
      <td>44.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.32ms</td>
      <td>0.81ms</td>
      <td>0.35ms</td>
      <td>0.37ms</td>
      <td>60.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.46ms</td>
      <td>0.91ms</td>
      <td>0.41ms</td>
      <td>0.51ms</td>
      <td>49.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.16ms</td>
      <td>0.58ms</td>
      <td>0.18ms</td>
      <td>0.30ms</td>
      <td>72.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.16ms</td>
      <td>0.58ms</td>
      <td>0.19ms</td>
      <td>0.30ms</td>
      <td>72.3%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>1.60ms</td>
      <td>2.83ms</td>
      <td>2.21ms</td>
      <td>2.41ms</td>
      <td>43.6%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>1.60ms</td>
      <td>2.83ms</td>
      <td>2.21ms</td>
      <td>2.40ms</td>
      <td>43.6%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1847.31ms</strong></td>
      <td><strong>2971.93ms</strong></td>
      <td><strong>1687.63ms</strong></td>
      <td><strong>2337.65ms</strong></td>
      <td><strong>37.8%</strong></td>
    </tr>
  </tbody>
</table>

## Encode: No Compression

_Levels: blazediff stored · spng stored · image-rs stored · zune stored._

> blazediff encodes **~3.34×** faster than spng (stored) across the corpus.

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
      <td>34.64ms</td>
      <td>103.14ms</td>
      <td>67.69ms</td>
      <td>143.76ms</td>
      <td>66.4%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>31.63ms</td>
      <td>101.95ms</td>
      <td>70.76ms</td>
      <td>144.84ms</td>
      <td>69.0%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>35.01ms</td>
      <td>112.57ms</td>
      <td>87.49ms</td>
      <td>177.09ms</td>
      <td>68.9%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>38.83ms</td>
      <td>115.81ms</td>
      <td>82.37ms</td>
      <td>168.22ms</td>
      <td>66.5%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>46.31ms</td>
      <td>140.46ms</td>
      <td>96.87ms</td>
      <td>201.77ms</td>
      <td>67.0%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>43.79ms</td>
      <td>139.41ms</td>
      <td>96.28ms</td>
      <td>201.32ms</td>
      <td>68.6%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.02ms</td>
      <td>0.09ms</td>
      <td>92.5%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.02ms</td>
      <td>0.09ms</td>
      <td>91.7%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.11ms</td>
      <td>1.14ms</td>
      <td>0.39ms</td>
      <td>1.40ms</td>
      <td>90.4%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.11ms</td>
      <td>1.15ms</td>
      <td>0.39ms</td>
      <td>1.34ms</td>
      <td>90.6%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.08ms</td>
      <td>0.92ms</td>
      <td>0.31ms</td>
      <td>1.10ms</td>
      <td>91.7%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.08ms</td>
      <td>0.92ms</td>
      <td>0.30ms</td>
      <td>1.08ms</td>
      <td>91.7%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>0.43ms</td>
      <td>4.39ms</td>
      <td>1.47ms</td>
      <td>5.25ms</td>
      <td>90.2%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>0.43ms</td>
      <td>4.31ms</td>
      <td>1.47ms</td>
      <td>5.20ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>1.02ms</td>
      <td>9.92ms</td>
      <td>9.79ms</td>
      <td>12.69ms</td>
      <td>89.7%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>1.02ms</td>
      <td>9.92ms</td>
      <td>9.72ms</td>
      <td>12.64ms</td>
      <td>89.7%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>113.13ms</td>
      <td>373.37ms</td>
      <td>286.76ms</td>
      <td>504.19ms</td>
      <td>69.7%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>111.22ms</td>
      <td>382.13ms</td>
      <td>281.48ms</td>
      <td>500.37ms</td>
      <td>70.9%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>77.44ms</td>
      <td>269.59ms</td>
      <td>204.71ms</td>
      <td>352.40ms</td>
      <td>71.3%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>77.49ms</td>
      <td>267.56ms</td>
      <td>204.41ms</td>
      <td>350.83ms</td>
      <td>71.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.30ms</td>
      <td>0.06ms</td>
      <td>0.33ms</td>
      <td>94.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.30ms</td>
      <td>0.06ms</td>
      <td>0.33ms</td>
      <td>94.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>93.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.02ms</td>
      <td>0.16ms</td>
      <td>93.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.30ms</td>
      <td>0.06ms</td>
      <td>0.33ms</td>
      <td>94.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.30ms</td>
      <td>0.06ms</td>
      <td>0.34ms</td>
      <td>94.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.03ms</td>
      <td>0.42ms</td>
      <td>0.10ms</td>
      <td>0.52ms</td>
      <td>93.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.03ms</td>
      <td>0.44ms</td>
      <td>0.10ms</td>
      <td>0.48ms</td>
      <td>93.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>92.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>93.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.02ms</td>
      <td>0.16ms</td>
      <td>93.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.14ms</td>
      <td>0.03ms</td>
      <td>0.16ms</td>
      <td>93.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.04ms</td>
      <td>0.59ms</td>
      <td>0.14ms</td>
      <td>0.72ms</td>
      <td>93.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.04ms</td>
      <td>0.59ms</td>
      <td>0.14ms</td>
      <td>0.72ms</td>
      <td>93.3%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>0.46ms</td>
      <td>4.60ms</td>
      <td>1.63ms</td>
      <td>5.87ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>0.46ms</td>
      <td>4.58ms</td>
      <td>2.06ms</td>
      <td>5.56ms</td>
      <td>89.9%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>613.96ms</strong></td>
      <td><strong>2052.11ms</strong></td>
      <td><strong>1507.24ms</strong></td>
      <td><strong>2801.81ms</strong></td>
      <td><strong>70.1%</strong></td>
    </tr>
  </tbody>
</table>

### Encode Size: No Compression

> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output, far larger than the rest.

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

## Encode: Half Compression

_Levels: blazediff libdeflate 6 · spng zlib 4 · image-rs flate2 4 · zune stored._

> blazediff encodes **~1.08×** faster than spng (zlib 4) across the corpus.

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
      <td>1781.46ms</td>
      <td>1912.43ms</td>
      <td>1156.42ms</td>
      <td>144.60ms</td>
      <td>6.8%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>1615.30ms</td>
      <td>1624.19ms</td>
      <td>971.13ms</td>
      <td>142.43ms</td>
      <td>0.5%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>1771.42ms</td>
      <td>2134.74ms</td>
      <td>1258.63ms</td>
      <td>181.27ms</td>
      <td>17.0%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>1794.01ms</td>
      <td>2189.86ms</td>
      <td>1285.96ms</td>
      <td>168.54ms</td>
      <td>18.1%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>2304.30ms</td>
      <td>2641.36ms</td>
      <td>1616.24ms</td>
      <td>202.61ms</td>
      <td>12.8%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>2292.00ms</td>
      <td>2605.45ms</td>
      <td>1583.33ms</td>
      <td>199.11ms</td>
      <td>12.0%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>1.16ms</td>
      <td>1.09ms</td>
      <td>0.33ms</td>
      <td>0.09ms</td>
      <td>-6.6%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>1.17ms</td>
      <td>1.08ms</td>
      <td>0.34ms</td>
      <td>0.09ms</td>
      <td>-8.3%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>11.64ms</td>
      <td>12.77ms</td>
      <td>3.25ms</td>
      <td>1.40ms</td>
      <td>8.8%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>11.64ms</td>
      <td>12.70ms</td>
      <td>3.15ms</td>
      <td>1.34ms</td>
      <td>8.4%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>9.84ms</td>
      <td>10.49ms</td>
      <td>2.73ms</td>
      <td>1.08ms</td>
      <td>6.2%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>10.21ms</td>
      <td>10.63ms</td>
      <td>2.79ms</td>
      <td>1.10ms</td>
      <td>4.0%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>90.62ms</td>
      <td>84.38ms</td>
      <td>40.06ms</td>
      <td>5.24ms</td>
      <td>-7.4%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>90.28ms</td>
      <td>83.62ms</td>
      <td>39.21ms</td>
      <td>5.19ms</td>
      <td>-8.0%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>90.92ms</td>
      <td>103.63ms</td>
      <td>22.51ms</td>
      <td>12.61ms</td>
      <td>12.3%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>90.88ms</td>
      <td>103.46ms</td>
      <td>22.47ms</td>
      <td>12.58ms</td>
      <td>12.2%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>2234.11ms</td>
      <td>2226.04ms</td>
      <td>738.81ms</td>
      <td>498.60ms</td>
      <td>-0.4%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>2232.74ms</td>
      <td>2218.79ms</td>
      <td>733.70ms</td>
      <td>503.63ms</td>
      <td>-0.6%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>1638.62ms</td>
      <td>1624.70ms</td>
      <td>629.87ms</td>
      <td>352.49ms</td>
      <td>-0.9%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>1624.73ms</td>
      <td>1614.86ms</td>
      <td>628.39ms</td>
      <td>346.72ms</td>
      <td>-0.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>5.19ms</td>
      <td>5.08ms</td>
      <td>1.84ms</td>
      <td>0.33ms</td>
      <td>-2.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>5.19ms</td>
      <td>5.07ms</td>
      <td>1.83ms</td>
      <td>0.33ms</td>
      <td>-2.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>4.44ms</td>
      <td>6.09ms</td>
      <td>3.65ms</td>
      <td>0.16ms</td>
      <td>27.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>4.44ms</td>
      <td>6.22ms</td>
      <td>3.75ms</td>
      <td>0.16ms</td>
      <td>28.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>4.67ms</td>
      <td>4.14ms</td>
      <td>1.20ms</td>
      <td>0.33ms</td>
      <td>-12.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>4.66ms</td>
      <td>4.22ms</td>
      <td>1.21ms</td>
      <td>0.34ms</td>
      <td>-10.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>12.48ms</td>
      <td>16.35ms</td>
      <td>9.95ms</td>
      <td>0.52ms</td>
      <td>23.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>12.92ms</td>
      <td>17.10ms</td>
      <td>10.29ms</td>
      <td>0.48ms</td>
      <td>24.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>2.18ms</td>
      <td>1.95ms</td>
      <td>0.51ms</td>
      <td>0.16ms</td>
      <td>-11.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>2.17ms</td>
      <td>1.93ms</td>
      <td>0.50ms</td>
      <td>0.16ms</td>
      <td>-12.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>3.99ms</td>
      <td>4.05ms</td>
      <td>2.66ms</td>
      <td>0.16ms</td>
      <td>1.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>3.85ms</td>
      <td>3.64ms</td>
      <td>2.29ms</td>
      <td>0.16ms</td>
      <td>-5.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>11.31ms</td>
      <td>10.87ms</td>
      <td>4.32ms</td>
      <td>0.72ms</td>
      <td>-4.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>11.30ms</td>
      <td>10.78ms</td>
      <td>4.30ms</td>
      <td>0.72ms</td>
      <td>-4.9%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>48.79ms</td>
      <td>51.95ms</td>
      <td>12.94ms</td>
      <td>5.87ms</td>
      <td>6.1%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>48.81ms</td>
      <td>51.93ms</td>
      <td>12.94ms</td>
      <td>5.57ms</td>
      <td>6.0%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>19883.50ms</strong></td>
      <td><strong>21417.65ms</strong></td>
      <td><strong>10813.51ms</strong></td>
      <td><strong>2796.88ms</strong></td>
      <td><strong>7.2%</strong></td>
    </tr>
  </tbody>
</table>

### Encode Size: Half Compression

> Output bytes per codec; the final row is each codec's total as a percentage of spng's (the de-facto reference). zune-png has no compressed mode, so it always writes stored output, far larger than the rest.

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

`@blazediff/codec-png-wasm` against [zune-png](https://github.com/etemesi254/zune-image) compiled to wasm (`apps/image-benchmark/zune-png-wasm`) and [jSquash](https://github.com/jamsinclair/jSquash) (`@jsquash/png`, the Rust `png` crate via Squoosh), run in Node v22.14.0 (V8) on INTEL(R) XEON(R) PLATINUM 8581C CPU @ 2.30GHz. Same method as above. Each timed call copies its input into wasm memory and its output back out. Refresh with `pnpm benchmark png-wasm`.

### Decode

> blazediff decodes **~2.42×** faster than jSquash across the corpus.

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
      <td>194.39ms</td>
      <td>241.41ms</td>
      <td>441.73ms</td>
      <td>56.0%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>192.41ms</td>
      <td>222.19ms</td>
      <td>428.55ms</td>
      <td>55.1%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>227.82ms</td>
      <td>287.64ms</td>
      <td>576.45ms</td>
      <td>60.5%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>248.06ms</td>
      <td>282.02ms</td>
      <td>595.44ms</td>
      <td>58.3%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>270.76ms</td>
      <td>320.07ms</td>
      <td>671.13ms</td>
      <td>59.7%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>269.91ms</td>
      <td>312.30ms</td>
      <td>667.11ms</td>
      <td>59.5%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.10ms</td>
      <td>0.12ms</td>
      <td>0.36ms</td>
      <td>73.1%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.10ms</td>
      <td>0.12ms</td>
      <td>0.37ms</td>
      <td>71.9%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>1.07ms</td>
      <td>1.17ms</td>
      <td>4.51ms</td>
      <td>76.2%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>1.02ms</td>
      <td>1.16ms</td>
      <td>4.50ms</td>
      <td>77.3%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.90ms</td>
      <td>1.05ms</td>
      <td>3.91ms</td>
      <td>76.9%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.96ms</td>
      <td>1.11ms</td>
      <td>4.02ms</td>
      <td>76.2%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>14.50ms</td>
      <td>16.84ms</td>
      <td>39.91ms</td>
      <td>63.7%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>14.52ms</td>
      <td>16.92ms</td>
      <td>40.18ms</td>
      <td>63.9%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>6.46ms</td>
      <td>6.69ms</td>
      <td>31.50ms</td>
      <td>79.5%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>6.53ms</td>
      <td>6.81ms</td>
      <td>32.20ms</td>
      <td>79.7%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>375.27ms</td>
      <td>430.90ms</td>
      <td>773.06ms</td>
      <td>51.5%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>371.69ms</td>
      <td>417.64ms</td>
      <td>779.61ms</td>
      <td>52.3%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>143.54ms</td>
      <td>169.48ms</td>
      <td>458.14ms</td>
      <td>68.7%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>146.77ms</td>
      <td>166.44ms</td>
      <td>453.46ms</td>
      <td>67.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.78ms</td>
      <td>0.96ms</td>
      <td>2.08ms</td>
      <td>62.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.61ms</td>
      <td>0.78ms</td>
      <td>1.91ms</td>
      <td>68.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.19ms</td>
      <td>0.20ms</td>
      <td>0.75ms</td>
      <td>75.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.18ms</td>
      <td>0.20ms</td>
      <td>0.76ms</td>
      <td>75.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.69ms</td>
      <td>1.64ms</td>
      <td>66.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.54ms</td>
      <td>0.66ms</td>
      <td>1.64ms</td>
      <td>67.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>1.65ms</td>
      <td>1.93ms</td>
      <td>4.27ms</td>
      <td>61.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.90ms</td>
      <td>2.14ms</td>
      <td>4.56ms</td>
      <td>58.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.43ms</td>
      <td>0.43ms</td>
      <td>0.83ms</td>
      <td>47.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.42ms</td>
      <td>0.42ms</td>
      <td>0.62ms</td>
      <td>31.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.54ms</td>
      <td>0.55ms</td>
      <td>1.14ms</td>
      <td>52.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.73ms</td>
      <td>0.82ms</td>
      <td>1.40ms</td>
      <td>48.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.36ms</td>
      <td>0.40ms</td>
      <td>2.03ms</td>
      <td>82.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.37ms</td>
      <td>0.42ms</td>
      <td>2.02ms</td>
      <td>81.6%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>3.37ms</td>
      <td>6.39ms</td>
      <td>13.72ms</td>
      <td>75.5%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>3.34ms</td>
      <td>6.39ms</td>
      <td>13.61ms</td>
      <td>75.4%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>2502.73ms</strong></td>
      <td><strong>2925.44ms</strong></td>
      <td><strong>6059.11ms</strong></td>
      <td><strong>58.7%</strong></td>
    </tr>
  </tbody>
</table>

### Encode: No Compression

_Levels: blazediff stored · zune-png stored._

> blazediff encodes **~1.86×** faster than zune-png (stored) across the corpus.

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
      <td>70.71ms</td>
      <td>134.87ms</td>
      <td>47.6%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>70.56ms</td>
      <td>135.07ms</td>
      <td>47.8%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>62.57ms</td>
      <td>152.99ms</td>
      <td>59.1%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>78.98ms</td>
      <td>152.99ms</td>
      <td>48.4%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>97.04ms</td>
      <td>182.08ms</td>
      <td>46.7%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>96.33ms</td>
      <td>182.10ms</td>
      <td>47.1%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.08ms</td>
      <td>0.12ms</td>
      <td>35.3%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.08ms</td>
      <td>0.12ms</td>
      <td>30.9%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>1.02ms</td>
      <td>1.76ms</td>
      <td>42.4%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>1.01ms</td>
      <td>1.76ms</td>
      <td>42.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.81ms</td>
      <td>1.42ms</td>
      <td>43.0%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.81ms</td>
      <td>1.42ms</td>
      <td>42.9%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>3.74ms</td>
      <td>6.87ms</td>
      <td>45.5%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>3.74ms</td>
      <td>6.95ms</td>
      <td>46.2%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>8.75ms</td>
      <td>17.33ms</td>
      <td>49.5%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>8.83ms</td>
      <td>17.18ms</td>
      <td>48.6%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>268.92ms</td>
      <td>491.88ms</td>
      <td>45.3%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>268.90ms</td>
      <td>487.96ms</td>
      <td>44.9%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>190.58ms</td>
      <td>342.34ms</td>
      <td>44.3%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>191.93ms</td>
      <td>340.27ms</td>
      <td>43.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.49ms</td>
      <td>42.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.25ms</td>
      <td>0.47ms</td>
      <td>47.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.21ms</td>
      <td>42.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.21ms</td>
      <td>40.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.25ms</td>
      <td>0.46ms</td>
      <td>47.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.24ms</td>
      <td>0.46ms</td>
      <td>48.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.37ms</td>
      <td>0.66ms</td>
      <td>44.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.38ms</td>
      <td>0.65ms</td>
      <td>42.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.20ms</td>
      <td>40.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.20ms</td>
      <td>40.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.20ms</td>
      <td>41.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.12ms</td>
      <td>0.20ms</td>
      <td>41.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.53ms</td>
      <td>0.95ms</td>
      <td>43.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.54ms</td>
      <td>0.96ms</td>
      <td>43.8%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>4.07ms</td>
      <td>7.22ms</td>
      <td>43.7%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>4.00ms</td>
      <td>7.30ms</td>
      <td>45.1%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1437.00ms</strong></td>
      <td><strong>2678.34ms</strong></td>
      <td><strong>46.3%</strong></td>
    </tr>
  </tbody>
</table>

#### Encode Size: No Compression

> Output bytes per codec; the final row is each codec's total as a percentage of zune-png's. zune-png has no compressed mode, so it always writes stored output, far larger than the rest.

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

### Encode: Default Settings

_Levels: blazediff fdeflate, adaptive filter · zune-png stored · jSquash png crate default._

> blazediff encodes **~1.09×** faster than jSquash (each codec's default) across the corpus.

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
      <td>244.56ms</td>
      <td>135.74ms</td>
      <td>288.85ms</td>
      <td>15.3%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>232.43ms</td>
      <td>135.17ms</td>
      <td>271.56ms</td>
      <td>14.4%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>247.28ms</td>
      <td>137.58ms</td>
      <td>318.48ms</td>
      <td>22.4%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>245.85ms</td>
      <td>154.12ms</td>
      <td>329.81ms</td>
      <td>25.5%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>338.90ms</td>
      <td>186.16ms</td>
      <td>399.29ms</td>
      <td>15.1%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>327.96ms</td>
      <td>182.93ms</td>
      <td>399.62ms</td>
      <td>17.9%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.16ms</td>
      <td>0.12ms</td>
      <td>0.17ms</td>
      <td>7.4%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.16ms</td>
      <td>0.12ms</td>
      <td>0.17ms</td>
      <td>7.1%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>3.25ms</td>
      <td>1.76ms</td>
      <td>2.63ms</td>
      <td>-23.9%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>3.26ms</td>
      <td>1.76ms</td>
      <td>2.63ms</td>
      <td>-24.2%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>1.31ms</td>
      <td>1.42ms</td>
      <td>1.80ms</td>
      <td>27.2%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>1.33ms</td>
      <td>1.42ms</td>
      <td>1.80ms</td>
      <td>26.1%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>16.34ms</td>
      <td>6.78ms</td>
      <td>16.74ms</td>
      <td>2.4%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>16.63ms</td>
      <td>6.79ms</td>
      <td>16.44ms</td>
      <td>-1.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>17.21ms</td>
      <td>17.24ms</td>
      <td>15.36ms</td>
      <td>-12.1%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>17.21ms</td>
      <td>17.21ms</td>
      <td>15.42ms</td>
      <td>-11.6%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>500.41ms</td>
      <td>488.54ms</td>
      <td>366.64ms</td>
      <td>-36.5%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>501.49ms</td>
      <td>487.70ms</td>
      <td>362.85ms</td>
      <td>-38.2%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>215.11ms</td>
      <td>333.24ms</td>
      <td>305.84ms</td>
      <td>29.7%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>203.43ms</td>
      <td>339.30ms</td>
      <td>308.21ms</td>
      <td>34.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.96ms</td>
      <td>0.49ms</td>
      <td>0.75ms</td>
      <td>-29.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.96ms</td>
      <td>0.47ms</td>
      <td>0.73ms</td>
      <td>-31.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.50ms</td>
      <td>0.21ms</td>
      <td>0.81ms</td>
      <td>39.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.50ms</td>
      <td>0.21ms</td>
      <td>0.80ms</td>
      <td>37.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.97ms</td>
      <td>0.46ms</td>
      <td>0.64ms</td>
      <td>-51.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.95ms</td>
      <td>0.46ms</td>
      <td>0.64ms</td>
      <td>-47.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>2.13ms</td>
      <td>0.66ms</td>
      <td>2.42ms</td>
      <td>12.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>2.09ms</td>
      <td>0.66ms</td>
      <td>2.44ms</td>
      <td>14.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.47ms</td>
      <td>0.20ms</td>
      <td>0.45ms</td>
      <td>-5.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.47ms</td>
      <td>0.20ms</td>
      <td>0.45ms</td>
      <td>-4.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.70ms</td>
      <td>0.20ms</td>
      <td>0.71ms</td>
      <td>1.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.70ms</td>
      <td>0.20ms</td>
      <td>0.67ms</td>
      <td>-3.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>1.28ms</td>
      <td>0.95ms</td>
      <td>1.80ms</td>
      <td>28.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>1.29ms</td>
      <td>0.96ms</td>
      <td>1.80ms</td>
      <td>28.6%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>10.09ms</td>
      <td>7.23ms</td>
      <td>8.51ms</td>
      <td>-18.6%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>10.09ms</td>
      <td>7.23ms</td>
      <td>8.47ms</td>
      <td>-19.2%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>3168.44ms</strong></td>
      <td><strong>2655.87ms</strong></td>
      <td><strong>3456.39ms</strong></td>
      <td><strong>8.3%</strong></td>
    </tr>
  </tbody>
</table>

#### Encode Size: Default Settings

> Output bytes per codec; the final row is each codec's total as a percentage of jSquash's. zune-png has no compressed mode, so it always writes stored output, far larger than the rest.

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
