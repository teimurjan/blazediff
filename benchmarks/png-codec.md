# PNG Codec Benchmarks

A from-scratch PNG codec in Rust (`blazediff-png`) against [spng](https://libspng.org), image-rs (`png`), and [zune-png](https://github.com/etemesi254/zune-image). Decode and encode are timed (best-of, size-scaled iteration counts) over the full fixture corpus (36 PNGs, 342.8 MPx), single-threaded on Apple M1 Max. Lower is better.

Encode is measured at two settings so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly: **no compression** (stored deflate blocks) and **half compression** (half of each codec's own max deflate level: libdeflate 12 → 6, zlib 9 → 4).

**Speed here, correctness elsewhere.** These are timing numbers. Byte-identical *decode* parity with spng is verified separately by the `corpus_differential` test on ~395 public images: Urban100, BSD100, Set14 and Set5 (real high-res photos) plus the full [PngSuite](http://www.schaik.com/pngsuite/) (every format corner and the intentionally-malformed files). Every file decodes byte-identically to spng at RGBA8 and at every `SPNG_FMT_*`, malformed files reject in lockstep, and every accepted image survives a blazediff encode → decode round-trip. Fetch the corpus with `crates/blazediff-png/scripts/fetch-corpus.sh` and run with `BLAZEDIFF_PNG_CORPUS` set; the `Benchmark PNG` GitHub workflow runs the benchmark and this verification.

## Decode

> blazediff decodes **~1.55×** faster than spng across the corpus.

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
      <td>121.01ms</td>
      <td>178.00ms</td>
      <td>151.00ms</td>
      <td>202.67ms</td>
      <td>32.0%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>110.48ms</td>
      <td>164.56ms</td>
      <td>143.78ms</td>
      <td>193.00ms</td>
      <td>32.9%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>144.93ms</td>
      <td>217.07ms</td>
      <td>193.93ms</td>
      <td>227.10ms</td>
      <td>33.2%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>144.24ms</td>
      <td>218.40ms</td>
      <td>195.04ms</td>
      <td>232.11ms</td>
      <td>34.0%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>149.66ms</td>
      <td>219.95ms</td>
      <td>193.52ms</td>
      <td>263.55ms</td>
      <td>32.0%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>148.59ms</td>
      <td>219.16ms</td>
      <td>193.05ms</td>
      <td>259.51ms</td>
      <td>32.2%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.07ms</td>
      <td>0.19ms</td>
      <td>0.07ms</td>
      <td>0.11ms</td>
      <td>64.9%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.07ms</td>
      <td>0.19ms</td>
      <td>0.08ms</td>
      <td>0.11ms</td>
      <td>64.8%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.51ms</td>
      <td>0.69ms</td>
      <td>0.71ms</td>
      <td>1.01ms</td>
      <td>26.8%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.51ms</td>
      <td>0.68ms</td>
      <td>0.71ms</td>
      <td>1.00ms</td>
      <td>25.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.49ms</td>
      <td>0.79ms</td>
      <td>0.67ms</td>
      <td>0.93ms</td>
      <td>38.2%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.53ms</td>
      <td>0.85ms</td>
      <td>0.72ms</td>
      <td>1.01ms</td>
      <td>37.2%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>8.52ms</td>
      <td>12.98ms</td>
      <td>12.06ms</td>
      <td>17.03ms</td>
      <td>34.3%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>8.76ms</td>
      <td>12.99ms</td>
      <td>12.05ms</td>
      <td>17.21ms</td>
      <td>32.5%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>2.52ms</td>
      <td>3.44ms</td>
      <td>3.37ms</td>
      <td>4.41ms</td>
      <td>26.8%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>2.56ms</td>
      <td>3.44ms</td>
      <td>3.42ms</td>
      <td>4.41ms</td>
      <td>25.6%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>132.47ms</td>
      <td>234.19ms</td>
      <td>182.26ms</td>
      <td>240.88ms</td>
      <td>43.4%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>131.48ms</td>
      <td>235.76ms</td>
      <td>181.14ms</td>
      <td>241.19ms</td>
      <td>44.2%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>25.78ms</td>
      <td>36.00ms</td>
      <td>20.20ms</td>
      <td>60.85ms</td>
      <td>28.4%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>26.49ms</td>
      <td>35.94ms</td>
      <td>20.32ms</td>
      <td>57.09ms</td>
      <td>26.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.54ms</td>
      <td>0.94ms</td>
      <td>0.65ms</td>
      <td>1.05ms</td>
      <td>42.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.42ms</td>
      <td>0.71ms</td>
      <td>0.52ms</td>
      <td>0.89ms</td>
      <td>40.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.10ms</td>
      <td>0.37ms</td>
      <td>0.12ms</td>
      <td>0.15ms</td>
      <td>71.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.11ms</td>
      <td>0.37ms</td>
      <td>0.12ms</td>
      <td>0.16ms</td>
      <td>71.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.39ms</td>
      <td>0.72ms</td>
      <td>0.46ms</td>
      <td>0.75ms</td>
      <td>46.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.38ms</td>
      <td>0.71ms</td>
      <td>0.47ms</td>
      <td>0.75ms</td>
      <td>46.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>1.02ms</td>
      <td>1.82ms</td>
      <td>1.35ms</td>
      <td>1.69ms</td>
      <td>44.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.17ms</td>
      <td>1.74ms</td>
      <td>1.33ms</td>
      <td>2.15ms</td>
      <td>32.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.30ms</td>
      <td>0.44ms</td>
      <td>0.28ms</td>
      <td>0.37ms</td>
      <td>32.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.29ms</td>
      <td>0.43ms</td>
      <td>0.27ms</td>
      <td>0.36ms</td>
      <td>33.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.34ms</td>
      <td>0.64ms</td>
      <td>0.38ms</td>
      <td>0.46ms</td>
      <td>46.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.52ms</td>
      <td>0.93ms</td>
      <td>0.51ms</td>
      <td>0.84ms</td>
      <td>43.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.17ms</td>
      <td>0.47ms</td>
      <td>0.18ms</td>
      <td>0.31ms</td>
      <td>63.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.17ms</td>
      <td>0.46ms</td>
      <td>0.18ms</td>
      <td>0.31ms</td>
      <td>63.6%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>2.06ms</td>
      <td>2.52ms</td>
      <td>2.61ms</td>
      <td>9.10ms</td>
      <td>18.3%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>2.09ms</td>
      <td>2.52ms</td>
      <td>2.59ms</td>
      <td>9.07ms</td>
      <td>17.4%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1169.74ms</strong></td>
      <td><strong>1811.09ms</strong></td>
      <td><strong>1520.11ms</strong></td>
      <td><strong>2053.59ms</strong></td>
      <td><strong>35.4%</strong></td>
    </tr>
  </tbody>
</table>

## Encode: No Compression

_Levels: blazediff stored · spng stored · image-rs stored · zune stored._

> blazediff encodes **~6.84×** faster than spng (stored) across the corpus.

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
      <td>4.16ms</td>
      <td>26.06ms</td>
      <td>37.17ms</td>
      <td>53.76ms</td>
      <td>84.0%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>4.23ms</td>
      <td>30.42ms</td>
      <td>35.33ms</td>
      <td>56.87ms</td>
      <td>86.1%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>4.73ms</td>
      <td>30.52ms</td>
      <td>27.13ms</td>
      <td>68.32ms</td>
      <td>84.5%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>4.74ms</td>
      <td>41.28ms</td>
      <td>31.37ms</td>
      <td>68.89ms</td>
      <td>88.5%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>5.62ms</td>
      <td>46.17ms</td>
      <td>46.69ms</td>
      <td>69.65ms</td>
      <td>87.8%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>5.63ms</td>
      <td>33.77ms</td>
      <td>32.80ms</td>
      <td>70.01ms</td>
      <td>83.3%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.04ms</td>
      <td>0.04ms</td>
      <td>0.09ms</td>
      <td>78.3%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.01ms</td>
      <td>0.04ms</td>
      <td>0.04ms</td>
      <td>0.10ms</td>
      <td>78.6%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.10ms</td>
      <td>0.43ms</td>
      <td>0.43ms</td>
      <td>1.18ms</td>
      <td>77.6%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.09ms</td>
      <td>0.43ms</td>
      <td>0.43ms</td>
      <td>1.18ms</td>
      <td>78.0%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.08ms</td>
      <td>0.35ms</td>
      <td>0.38ms</td>
      <td>0.95ms</td>
      <td>76.8%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.08ms</td>
      <td>0.34ms</td>
      <td>0.38ms</td>
      <td>0.95ms</td>
      <td>76.5%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>0.36ms</td>
      <td>1.81ms</td>
      <td>3.62ms</td>
      <td>5.41ms</td>
      <td>80.3%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>0.36ms</td>
      <td>2.14ms</td>
      <td>3.27ms</td>
      <td>4.89ms</td>
      <td>83.3%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>0.85ms</td>
      <td>6.19ms</td>
      <td>8.41ms</td>
      <td>11.67ms</td>
      <td>86.3%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>0.85ms</td>
      <td>6.47ms</td>
      <td>7.76ms</td>
      <td>11.74ms</td>
      <td>86.9%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>16.63ms</td>
      <td>107.79ms</td>
      <td>115.74ms</td>
      <td>176.36ms</td>
      <td>84.6%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>16.48ms</td>
      <td>104.92ms</td>
      <td>103.86ms</td>
      <td>179.94ms</td>
      <td>84.3%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>12.00ms</td>
      <td>84.70ms</td>
      <td>53.94ms</td>
      <td>128.67ms</td>
      <td>85.8%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>12.88ms</td>
      <td>91.66ms</td>
      <td>103.76ms</td>
      <td>136.61ms</td>
      <td>85.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.15ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>80.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.13ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>77.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.02ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.15ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>80.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.03ms</td>
      <td>0.15ms</td>
      <td>0.10ms</td>
      <td>0.34ms</td>
      <td>80.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.04ms</td>
      <td>0.17ms</td>
      <td>0.14ms</td>
      <td>0.45ms</td>
      <td>74.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.04ms</td>
      <td>0.18ms</td>
      <td>0.16ms</td>
      <td>0.47ms</td>
      <td>74.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.08ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>81.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.18ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.01ms</td>
      <td>0.07ms</td>
      <td>0.05ms</td>
      <td>0.17ms</td>
      <td>78.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.06ms</td>
      <td>0.24ms</td>
      <td>0.22ms</td>
      <td>0.65ms</td>
      <td>76.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.06ms</td>
      <td>0.27ms</td>
      <td>0.23ms</td>
      <td>0.65ms</td>
      <td>78.9%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>0.39ms</td>
      <td>2.80ms</td>
      <td>3.77ms</td>
      <td>5.81ms</td>
      <td>86.2%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>0.39ms</td>
      <td>2.85ms</td>
      <td>4.16ms</td>
      <td>5.75ms</td>
      <td>86.4%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>91.06ms</strong></td>
      <td><strong>623.04ms</strong></td>
      <td><strong>621.92ms</strong></td>
      <td><strong>1063.41ms</strong></td>
      <td><strong>85.4%</strong></td>
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

> blazediff encodes **~3.81×** faster than spng (zlib 4) across the corpus.

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
      <td>1092.39ms</td>
      <td>2788.28ms</td>
      <td>1028.47ms</td>
      <td>56.73ms</td>
      <td>60.8%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>932.80ms</td>
      <td>2414.96ms</td>
      <td>878.25ms</td>
      <td>58.20ms</td>
      <td>61.4%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>952.97ms</td>
      <td>2954.75ms</td>
      <td>1070.32ms</td>
      <td>67.88ms</td>
      <td>67.7%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>961.95ms</td>
      <td>2996.79ms</td>
      <td>1092.26ms</td>
      <td>68.21ms</td>
      <td>67.9%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>1397.79ms</td>
      <td>3732.14ms</td>
      <td>1428.29ms</td>
      <td>69.42ms</td>
      <td>62.5%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>1396.70ms</td>
      <td>3754.83ms</td>
      <td>1418.32ms</td>
      <td>71.32ms</td>
      <td>62.8%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.35ms</td>
      <td>2.74ms</td>
      <td>0.36ms</td>
      <td>0.09ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.35ms</td>
      <td>2.73ms</td>
      <td>0.38ms</td>
      <td>0.10ms</td>
      <td>87.1%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>3.79ms</td>
      <td>33.20ms</td>
      <td>2.95ms</td>
      <td>1.15ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>3.80ms</td>
      <td>33.86ms</td>
      <td>2.95ms</td>
      <td>1.18ms</td>
      <td>88.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>3.27ms</td>
      <td>27.23ms</td>
      <td>2.55ms</td>
      <td>0.94ms</td>
      <td>88.0%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>3.30ms</td>
      <td>27.29ms</td>
      <td>2.61ms</td>
      <td>0.95ms</td>
      <td>87.9%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>37.07ms</td>
      <td>156.49ms</td>
      <td>37.45ms</td>
      <td>5.43ms</td>
      <td>76.3%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>36.50ms</td>
      <td>152.77ms</td>
      <td>36.67ms</td>
      <td>5.44ms</td>
      <td>76.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>29.11ms</td>
      <td>294.65ms</td>
      <td>20.40ms</td>
      <td>11.69ms</td>
      <td>90.1%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>29.15ms</td>
      <td>290.95ms</td>
      <td>20.37ms</td>
      <td>11.68ms</td>
      <td>90.0%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>797.81ms</td>
      <td>4981.25ms</td>
      <td>694.10ms</td>
      <td>183.91ms</td>
      <td>84.0%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>797.64ms</td>
      <td>4951.09ms</td>
      <td>694.17ms</td>
      <td>180.07ms</td>
      <td>83.9%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>607.52ms</td>
      <td>3585.33ms</td>
      <td>598.00ms</td>
      <td>142.50ms</td>
      <td>83.1%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>616.85ms</td>
      <td>3636.61ms</td>
      <td>622.71ms</td>
      <td>144.73ms</td>
      <td>83.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>1.63ms</td>
      <td>11.14ms</td>
      <td>1.68ms</td>
      <td>0.34ms</td>
      <td>85.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>1.61ms</td>
      <td>11.08ms</td>
      <td>1.72ms</td>
      <td>0.35ms</td>
      <td>85.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>2.42ms</td>
      <td>9.01ms</td>
      <td>3.19ms</td>
      <td>0.17ms</td>
      <td>73.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>2.49ms</td>
      <td>9.15ms</td>
      <td>3.28ms</td>
      <td>0.17ms</td>
      <td>72.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>1.31ms</td>
      <td>10.44ms</td>
      <td>1.16ms</td>
      <td>0.34ms</td>
      <td>87.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>1.29ms</td>
      <td>10.41ms</td>
      <td>1.16ms</td>
      <td>0.34ms</td>
      <td>87.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>6.88ms</td>
      <td>24.25ms</td>
      <td>8.66ms</td>
      <td>0.45ms</td>
      <td>71.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>6.91ms</td>
      <td>24.71ms</td>
      <td>8.99ms</td>
      <td>0.48ms</td>
      <td>72.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.61ms</td>
      <td>5.07ms</td>
      <td>0.60ms</td>
      <td>0.17ms</td>
      <td>87.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.60ms</td>
      <td>5.06ms</td>
      <td>0.57ms</td>
      <td>0.17ms</td>
      <td>88.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>2.06ms</td>
      <td>7.17ms</td>
      <td>2.47ms</td>
      <td>0.18ms</td>
      <td>71.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>1.99ms</td>
      <td>6.68ms</td>
      <td>2.08ms</td>
      <td>0.17ms</td>
      <td>70.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>3.71ms</td>
      <td>21.74ms</td>
      <td>4.06ms</td>
      <td>0.65ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>3.74ms</td>
      <td>21.81ms</td>
      <td>4.00ms</td>
      <td>0.65ms</td>
      <td>82.9%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>15.45ms</td>
      <td>135.89ms</td>
      <td>12.23ms</td>
      <td>5.74ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>15.46ms</td>
      <td>135.99ms</td>
      <td>12.16ms</td>
      <td>5.68ms</td>
      <td>88.6%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>9769.28ms</strong></td>
      <td><strong>37267.55ms</strong></td>
      <td><strong>9719.60ms</strong></td>
      <td><strong>1097.70ms</strong></td>
      <td><strong>73.8%</strong></td>
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
      <td>182.98ms</td>
      <td>221.14ms</td>
      <td>392.42ms</td>
      <td>53.4%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>165.05ms</td>
      <td>201.63ms</td>
      <td>373.53ms</td>
      <td>55.8%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>217.77ms</td>
      <td>255.12ms</td>
      <td>525.20ms</td>
      <td>58.5%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>219.03ms</td>
      <td>264.74ms</td>
      <td>528.17ms</td>
      <td>58.5%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>246.50ms</td>
      <td>306.25ms</td>
      <td>573.14ms</td>
      <td>57.0%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>234.38ms</td>
      <td>307.35ms</td>
      <td>573.61ms</td>
      <td>59.1%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.11ms</td>
      <td>0.33ms</td>
      <td>71.4%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.10ms</td>
      <td>0.10ms</td>
      <td>0.33ms</td>
      <td>69.0%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.76ms</td>
      <td>0.95ms</td>
      <td>4.30ms</td>
      <td>82.2%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.77ms</td>
      <td>0.95ms</td>
      <td>4.25ms</td>
      <td>81.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.73ms</td>
      <td>0.87ms</td>
      <td>3.61ms</td>
      <td>79.7%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.78ms</td>
      <td>0.93ms</td>
      <td>3.69ms</td>
      <td>79.0%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>13.34ms</td>
      <td>16.08ms</td>
      <td>35.65ms</td>
      <td>62.6%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>13.06ms</td>
      <td>15.99ms</td>
      <td>35.40ms</td>
      <td>63.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>4.34ms</td>
      <td>4.77ms</td>
      <td>31.82ms</td>
      <td>86.3%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>4.38ms</td>
      <td>4.97ms</td>
      <td>32.09ms</td>
      <td>86.4%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>222.28ms</td>
      <td>259.17ms</td>
      <td>606.70ms</td>
      <td>63.4%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>202.06ms</td>
      <td>261.17ms</td>
      <td>601.89ms</td>
      <td>66.4%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>47.07ms</td>
      <td>52.58ms</td>
      <td>282.32ms</td>
      <td>83.3%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>47.01ms</td>
      <td>53.21ms</td>
      <td>283.06ms</td>
      <td>83.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.77ms</td>
      <td>0.93ms</td>
      <td>1.79ms</td>
      <td>56.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.59ms</td>
      <td>0.76ms</td>
      <td>1.73ms</td>
      <td>66.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.20ms</td>
      <td>0.22ms</td>
      <td>0.73ms</td>
      <td>73.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.20ms</td>
      <td>0.22ms</td>
      <td>0.75ms</td>
      <td>72.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.67ms</td>
      <td>1.51ms</td>
      <td>63.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.66ms</td>
      <td>1.50ms</td>
      <td>63.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>1.78ms</td>
      <td>2.18ms</td>
      <td>4.34ms</td>
      <td>59.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>1.99ms</td>
      <td>2.34ms</td>
      <td>4.43ms</td>
      <td>55.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.56ms</td>
      <td>0.99ms</td>
      <td>44.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.56ms</td>
      <td>0.55ms</td>
      <td>0.74ms</td>
      <td>25.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.67ms</td>
      <td>0.67ms</td>
      <td>1.32ms</td>
      <td>49.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.90ms</td>
      <td>0.99ms</td>
      <td>1.37ms</td>
      <td>34.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>0.35ms</td>
      <td>0.39ms</td>
      <td>1.90ms</td>
      <td>81.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>0.34ms</td>
      <td>0.39ms</td>
      <td>1.88ms</td>
      <td>81.7%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>3.03ms</td>
      <td>7.48ms</td>
      <td>14.03ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>3.04ms</td>
      <td>7.47ms</td>
      <td>14.10ms</td>
      <td>78.4%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>1838.53ms</strong></td>
      <td><strong>2254.56ms</strong></td>
      <td><strong>4944.63ms</strong></td>
      <td><strong>62.8%</strong></td>
    </tr>
  </tbody>
</table>

### Encode: No Compression

_Levels: blazediff stored · zune-png stored._

> blazediff encodes **~1.72×** faster than zune-png (stored) across the corpus.

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
      <td>36.51ms</td>
      <td>65.03ms</td>
      <td>43.9%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>36.96ms</td>
      <td>64.97ms</td>
      <td>43.1%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>40.92ms</td>
      <td>83.12ms</td>
      <td>50.8%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>41.18ms</td>
      <td>72.80ms</td>
      <td>43.4%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>49.90ms</td>
      <td>93.73ms</td>
      <td>46.8%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>51.17ms</td>
      <td>87.52ms</td>
      <td>41.5%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.13ms</td>
      <td>36.2%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.09ms</td>
      <td>0.13ms</td>
      <td>34.8%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>0.89ms</td>
      <td>1.45ms</td>
      <td>38.9%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>0.89ms</td>
      <td>1.48ms</td>
      <td>39.8%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>0.75ms</td>
      <td>1.19ms</td>
      <td>36.8%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>0.75ms</td>
      <td>1.17ms</td>
      <td>35.9%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>3.32ms</td>
      <td>5.95ms</td>
      <td>44.2%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>3.29ms</td>
      <td>5.81ms</td>
      <td>43.3%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>8.01ms</td>
      <td>13.50ms</td>
      <td>40.7%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>7.93ms</td>
      <td>13.93ms</td>
      <td>43.1%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>148.68ms</td>
      <td>232.78ms</td>
      <td>36.1%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>128.05ms</td>
      <td>216.37ms</td>
      <td>40.8%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>88.63ms</td>
      <td>154.59ms</td>
      <td>42.7%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>89.02ms</td>
      <td>155.10ms</td>
      <td>42.6%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.45ms</td>
      <td>38.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.45ms</td>
      <td>37.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.13ms</td>
      <td>0.22ms</td>
      <td>38.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>39.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>0.27ms</td>
      <td>0.44ms</td>
      <td>38.2%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>0.28ms</td>
      <td>0.44ms</td>
      <td>38.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>0.38ms</td>
      <td>0.62ms</td>
      <td>38.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>0.39ms</td>
      <td>0.62ms</td>
      <td>38.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.23ms</td>
      <td>39.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>37.8%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>38.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.14ms</td>
      <td>0.22ms</td>
      <td>37.9%</td>
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
      <td>0.85ms</td>
      <td>39.5%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>3.58ms</td>
      <td>6.18ms</td>
      <td>42.2%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>3.59ms</td>
      <td>6.17ms</td>
      <td>41.9%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>747.93ms</strong></td>
      <td><strong>1289.18ms</strong></td>
      <td><strong>42.0%</strong></td>
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

> blazediff encodes **~1.17×** faster than jSquash (each codec's default) across the corpus.

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
      <td>231.83ms</td>
      <td>64.86ms</td>
      <td>286.39ms</td>
      <td>19.1%</td>
    </tr>
    <tr>
      <td>4k/1b.png</td>
      <td>17.9</td>
      <td>222.37ms</td>
      <td>63.89ms</td>
      <td>271.57ms</td>
      <td>18.1%</td>
    </tr>
    <tr>
      <td>4k/2a.png</td>
      <td>20.0</td>
      <td>230.56ms</td>
      <td>74.90ms</td>
      <td>304.08ms</td>
      <td>24.2%</td>
    </tr>
    <tr>
      <td>4k/2b.png</td>
      <td>20.0</td>
      <td>233.64ms</td>
      <td>72.36ms</td>
      <td>296.17ms</td>
      <td>21.1%</td>
    </tr>
    <tr>
      <td>4k/3a.png</td>
      <td>24.0</td>
      <td>297.79ms</td>
      <td>87.30ms</td>
      <td>377.42ms</td>
      <td>21.1%</td>
    </tr>
    <tr>
      <td>4k/3b.png</td>
      <td>24.0</td>
      <td>308.29ms</td>
      <td>88.28ms</td>
      <td>379.88ms</td>
      <td>18.8%</td>
    </tr>
    <tr>
      <td>alpha/1a.png</td>
      <td>0.0</td>
      <td>0.15ms</td>
      <td>0.13ms</td>
      <td>0.22ms</td>
      <td>29.5%</td>
    </tr>
    <tr>
      <td>alpha/1b.png</td>
      <td>0.0</td>
      <td>0.15ms</td>
      <td>0.13ms</td>
      <td>0.22ms</td>
      <td>30.8%</td>
    </tr>
    <tr>
      <td>blazediff/1a.png</td>
      <td>0.4</td>
      <td>3.39ms</td>
      <td>1.46ms</td>
      <td>3.16ms</td>
      <td>-7.1%</td>
    </tr>
    <tr>
      <td>blazediff/1b.png</td>
      <td>0.4</td>
      <td>3.39ms</td>
      <td>1.48ms</td>
      <td>3.13ms</td>
      <td>-8.2%</td>
    </tr>
    <tr>
      <td>blazediff/2a.png</td>
      <td>0.4</td>
      <td>1.37ms</td>
      <td>1.19ms</td>
      <td>2.12ms</td>
      <td>35.4%</td>
    </tr>
    <tr>
      <td>blazediff/2b.png</td>
      <td>0.4</td>
      <td>1.38ms</td>
      <td>1.17ms</td>
      <td>2.14ms</td>
      <td>35.2%</td>
    </tr>
    <tr>
      <td>blazediff/3a.png</td>
      <td>1.6</td>
      <td>17.45ms</td>
      <td>5.80ms</td>
      <td>18.07ms</td>
      <td>3.4%</td>
    </tr>
    <tr>
      <td>blazediff/3b.png</td>
      <td>1.6</td>
      <td>17.39ms</td>
      <td>5.76ms</td>
      <td>17.95ms</td>
      <td>3.1%</td>
    </tr>
    <tr>
      <td>blazediff/4a.png</td>
      <td>3.8</td>
      <td>23.82ms</td>
      <td>13.57ms</td>
      <td>19.48ms</td>
      <td>-22.3%</td>
    </tr>
    <tr>
      <td>blazediff/4b.png</td>
      <td>3.8</td>
      <td>24.01ms</td>
      <td>13.43ms</td>
      <td>19.54ms</td>
      <td>-22.9%</td>
    </tr>
    <tr>
      <td>page/1a.png</td>
      <td>58.9</td>
      <td>470.65ms</td>
      <td>215.73ms</td>
      <td>401.10ms</td>
      <td>-17.3%</td>
    </tr>
    <tr>
      <td>page/1b.png</td>
      <td>58.9</td>
      <td>469.37ms</td>
      <td>216.04ms</td>
      <td>398.33ms</td>
      <td>-17.8%</td>
    </tr>
    <tr>
      <td>page/2a.png</td>
      <td>41.7</td>
      <td>205.48ms</td>
      <td>154.25ms</td>
      <td>322.51ms</td>
      <td>36.3%</td>
    </tr>
    <tr>
      <td>page/2b.png</td>
      <td>41.7</td>
      <td>188.39ms</td>
      <td>154.77ms</td>
      <td>322.93ms</td>
      <td>41.7%</td>
    </tr>
    <tr>
      <td>pixelmatch/1a.png</td>
      <td>0.1</td>
      <td>1.10ms</td>
      <td>0.45ms</td>
      <td>0.91ms</td>
      <td>-21.3%</td>
    </tr>
    <tr>
      <td>pixelmatch/1b.png</td>
      <td>0.1</td>
      <td>1.11ms</td>
      <td>0.45ms</td>
      <td>0.91ms</td>
      <td>-21.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/2a.png</td>
      <td>0.1</td>
      <td>0.48ms</td>
      <td>0.22ms</td>
      <td>0.89ms</td>
      <td>46.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/2b.png</td>
      <td>0.1</td>
      <td>0.47ms</td>
      <td>0.22ms</td>
      <td>0.88ms</td>
      <td>45.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/3a.png</td>
      <td>0.1</td>
      <td>1.09ms</td>
      <td>0.44ms</td>
      <td>0.81ms</td>
      <td>-34.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/3b.png</td>
      <td>0.1</td>
      <td>1.08ms</td>
      <td>0.44ms</td>
      <td>0.81ms</td>
      <td>-33.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/4a.png</td>
      <td>0.2</td>
      <td>2.25ms</td>
      <td>0.61ms</td>
      <td>2.62ms</td>
      <td>14.1%</td>
    </tr>
    <tr>
      <td>pixelmatch/4b.png</td>
      <td>0.2</td>
      <td>2.24ms</td>
      <td>0.62ms</td>
      <td>2.62ms</td>
      <td>14.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5a.png</td>
      <td>0.1</td>
      <td>0.56ms</td>
      <td>0.22ms</td>
      <td>0.52ms</td>
      <td>-8.4%</td>
    </tr>
    <tr>
      <td>pixelmatch/5b.png</td>
      <td>0.1</td>
      <td>0.55ms</td>
      <td>0.22ms</td>
      <td>0.52ms</td>
      <td>-7.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/6a.png</td>
      <td>0.1</td>
      <td>0.78ms</td>
      <td>0.22ms</td>
      <td>0.80ms</td>
      <td>3.0%</td>
    </tr>
    <tr>
      <td>pixelmatch/6b.png</td>
      <td>0.1</td>
      <td>0.77ms</td>
      <td>0.22ms</td>
      <td>0.74ms</td>
      <td>-4.5%</td>
    </tr>
    <tr>
      <td>pixelmatch/7a.png</td>
      <td>0.3</td>
      <td>1.21ms</td>
      <td>0.85ms</td>
      <td>2.05ms</td>
      <td>40.9%</td>
    </tr>
    <tr>
      <td>pixelmatch/7b.png</td>
      <td>0.3</td>
      <td>1.18ms</td>
      <td>0.85ms</td>
      <td>2.05ms</td>
      <td>42.7%</td>
    </tr>
    <tr>
      <td>same/1a.png</td>
      <td>1.7</td>
      <td>12.65ms</td>
      <td>6.21ms</td>
      <td>10.70ms</td>
      <td>-18.3%</td>
    </tr>
    <tr>
      <td>same/1b.png</td>
      <td>1.7</td>
      <td>12.70ms</td>
      <td>6.14ms</td>
      <td>10.75ms</td>
      <td>-18.1%</td>
    </tr>
    <tr>
      <td><strong>TOTAL</strong></td>
      <td></td>
      <td><strong>2991.12ms</strong></td>
      <td><strong>1254.93ms</strong></td>
      <td><strong>3484.98ms</strong></td>
      <td><strong>14.2%</strong></td>
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
