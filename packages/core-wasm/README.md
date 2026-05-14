# @blazediff/core-wasm

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore-wasm)](https://www.npmjs.com/package/@blazediff/core-wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore-wasm)](https://www.npmjs.com/package/@blazediff/core-wasm)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg)](https://crates.io/crates/blazediff)

</div>

WebAssembly build of the BlazeDiff Rust algorithm for browsers, edge runtimes, and any wasm host. Same two-pass block algorithm as [`@blazediff/core-native`](https://www.npmjs.com/package/@blazediff/core-native), compiled to `wasm32` with `v128` SIMD (`+simd128`). **~58%** faster than [pixelmatch](https://github.com/mapbox/pixelmatch) on the same RGBA buffers; diff counts agree with pixelmatch to within ~0.05%.

**Features:**
- Same Rust algorithm as `@blazediff/core-native` (YIQ perceptual delta + block-based cold/hot pass)
- `wasm32` v128 SIMD: 4-lane vectorized cold and hot loops; up to ~16x faster than pixelmatch on 4K
- Buffers-only API: caller decodes images, hands in `Uint8Array`. No PNG/JPEG codecs bundled
- ~32 KB optimized wasm + ~10 KB JS glue. No native binaries, no postinstall, no platform packages
- Runs anywhere wasm runs: browsers, Node 18+, Cloudflare Workers, Deno, Bun

## Installation

```bash
npm install @blazediff/core-wasm
```

## Loading the wasm module

Pick the recipe that matches your runtime. All four are equivalent; the wasm itself is the same.

### Browser (default fetch)

The wasm-bindgen `--target web` glue fetches the sibling `.wasm` via `import.meta.url` automatically:

```typescript
import { initBlazediff } from '@blazediff/core-wasm';
await initBlazediff();
```

### Universal CDN URL (recommended for Node, Workers, Deno, Bun)

jsDelivr serves the published `.wasm` over HTTPS, so any `fetch()`-capable runtime can load it. One network round-trip on cold start, cached by the runtime after that:

```typescript
import { initBlazediff } from '@blazediff/core-wasm';

await initBlazediff(
  new URL(
    'https://cdn.jsdelivr.net/npm/@blazediff/core-wasm@4.2.0/wasm/blazediff_bg.wasm',
  ),
);
```

Pin the version (`@4.2.0`) for reproducibility. `unpkg.com/@blazediff/core-wasm@4.2.0/wasm/blazediff_bg.wasm` works identically.

### Bundlers (Vite, Webpack 5+, esbuild, Rollup with plugin)

The `new URL(asset, import.meta.url)` pattern is bundler-aware: the asset is emitted into the build output and the URL is rewritten at build time:

```typescript
import { initBlazediff } from '@blazediff/core-wasm';

const wasmUrl = new URL(
  '@blazediff/core-wasm/wasm/blazediff_bg.wasm',
  import.meta.url,
);
await initBlazediff(wasmUrl);
```

### Node from the local filesystem

Offline, no CDN dependency. Read the bytes and pass them in:

```typescript
// ESM (Node 20.6+):
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initBlazediff } from '@blazediff/core-wasm';

const wasmPath = fileURLToPath(
  import.meta.resolve('@blazediff/core-wasm/wasm/blazediff_bg.wasm'),
);
await initBlazediff(readFileSync(wasmPath));
```

```typescript
// CommonJS:
const { readFileSync } = require('node:fs');
const { initBlazediff } = require('@blazediff/core-wasm');

const wasmPath = require.resolve(
  '@blazediff/core-wasm/wasm/blazediff_bg.wasm',
);
await initBlazediff(readFileSync(wasmPath));
```

## API

### `initBlazediff(input?)`

Initializes the wasm module. Safe to call multiple times; subsequent calls return the cached promise. Accepts a `URL`, `Response`, `ArrayBuffer`, `Uint8Array`, or compiled `WebAssembly.Module`. Without `input`, the default `--target web` glue fetches the sibling `blazediff_bg.wasm` via `import.meta.url` (works in browsers; other runtimes need an explicit input, see above).

**Returns:** `Promise<void>`

### `diff(a, b, width, height, output?, options?)`

Compares two RGBA pixel buffers and returns the number of differing pixels.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>a</code></td>
    <td>Uint8Array</td>
    <td>First image in RGBA8 order (<code>width * height * 4</code> bytes)</td>
  </tr>
  <tr>
    <td><code>b</code></td>
    <td>Uint8Array</td>
    <td>Second image in RGBA8 order (same length)</td>
  </tr>
  <tr>
    <td><code>width</code></td>
    <td>number</td>
    <td>Image width in pixels</td>
  </tr>
  <tr>
    <td><code>height</code></td>
    <td>number</td>
    <td>Image height in pixels</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array | undefined</td>
    <td>Optional diff visualization buffer (same length). Written in place</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>DiffOptions</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

**Returns:** `Promise<number>` (count of differing pixels)

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0.0-1.0). Lower = more strict</td>
  </tr>
  <tr>
    <td><code>includeAA</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Count anti-aliased pixels as differences</td>
  </tr>
  <tr>
    <td><code>diffMask</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Render diff with transparent background instead of grayscale base</td>
  </tr>
</table>

## Usage

### Browser

Decode images via `createImageBitmap` + `OffscreenCanvas` (or the `ImageDecoder` API), then pass the RGBA buffer to `diff()`:

```typescript
import { diff, initBlazediff } from '@blazediff/core-wasm';

await initBlazediff();

async function toRgba(url: string) {
  const bitmap = await createImageBitmap(await (await fetch(url)).blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  return { data: new Uint8Array(data.buffer), width: bitmap.width, height: bitmap.height };
}

const a = await toRgba('/baseline.png');
const b = await toRgba('/current.png');
const out = new Uint8Array(a.width * a.height * 4);

const diffCount = await diff(a.data, b.data, a.width, a.height, out, {
  threshold: 0.1,
});

console.log(`${diffCount} pixels differ`);
```

### Node

```typescript
import { readFileSync } from 'node:fs';
import { diff, initBlazediff } from '@blazediff/core-wasm';
import { PNG } from 'pngjs';

await initBlazediff(
  new URL(
    'https://cdn.jsdelivr.net/npm/@blazediff/core-wasm@4.2.0/wasm/blazediff_bg.wasm',
  ),
);

const a = PNG.sync.read(readFileSync('baseline.png'));
const b = PNG.sync.read(readFileSync('current.png'));
const diffCount = await diff(
  new Uint8Array(a.data),
  new Uint8Array(b.data),
  a.width,
  a.height,
);
```

## Performance

vs `pixelmatch` on M1 Max, image I/O excluded (pre-decoded RGBA buffers):

| Fixture       | pixelmatch | core-wasm | Improvement |
|---------------|------------|-----------|-------------|
| 4k/1          | 287.72ms   | 51.75ms   | **82.0%**   |
| 4k/3          | 366.81ms   | 69.90ms   | **80.9%**   |
| page/2        | 443.83ms   | 109.74ms  | **75.3%**   |
| blazediff/3   | 14.60ms    | 5.52ms    | **62.2%**   |
| pixelmatch/1  | 0.87ms     | 0.13ms    | **84.6%**   |

Average **~58%** faster across the full fixture set. Counts agree with pixelmatch within ~0.05% (e.g. `4k/1`: 69 932 vs 69 912 of 17 920 000 pixels). Full benchmarks in [BENCHMARKS.md](https://github.com/teimurjan/blazediff/blob/main/BENCHMARKS.md).

## Algorithm

Same two-pass block-based approach as `@blazediff/core-native`, recompiled for wasm:

1. **Cold pass:** scans the image in 8x8 blocks using 32-bit integer comparison to identify changed regions
2. **Hot pass:** only processes blocks marked as changed, applying YIQ perceptual color difference
3. **SIMD:** `v128` intrinsics (`f32x4_*`, `i32x4_*`) for parallel 4-lane RGBA extraction, alpha blend, YIQ transform, and threshold compare. Baseline simd128 has no native FMA, so weighted sums use `add(mul, c)`
4. **Anti-aliasing:** Vysniauskas (2009) algorithm to detect AA artifacts

## Picking the right package

| Use case                          | Package                                                                       |
|-----------------------------------|-------------------------------------------------------------------------------|
| Browser, edge worker, wasm host   | **`@blazediff/core-wasm`**                                                    |
| Node CLI / server with native bin | [`@blazediff/core-native`](https://www.npmjs.com/package/@blazediff/core-native) |
| Pure JS / no wasm support         | [`@blazediff/core`](https://www.npmjs.com/package/@blazediff/core)            |

## References

- **YIQ Color Space:** [Kotsarenko & Ramos (2009)](https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad)
- **Anti-Aliasing Detection:** [Vysniauskas (2009)](https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector)
- **WebAssembly SIMD:** [WebAssembly/simd](https://github.com/WebAssembly/simd) (v128 / simd128 specification)
