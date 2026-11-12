# @blazediff/core-wasm

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-wasm)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=for-the-badge)](https://crates.io/crates/blazediff)

</div>

WebAssembly build of the BlazeDiff Rust algorithm for browsers, edge runtimes, and any wasm host. Same block-band algorithm as [`@blazediff/core-native`](https://www.npmjs.com/package/@blazediff/core-native), compiled to `wasm32` with `v128` SIMD (`+simd128`). About **3.8x** faster than [pixelmatch](https://github.com/mapbox/pixelmatch) in total time on the same RGBA buffers (3x to 6x on 4K); diff counts agree with pixelmatch to within ~0.05%.

**Features:**
- Same Rust algorithm as `@blazediff/core-native` (YIQ perceptual delta + block-based cold/hot pass)
- `wasm32` v128 SIMD: 4-lane vectorized cold and hot loops; up to ~11x faster than pixelmatch on 4K
- Same `Image`, `DiffOptions` and `DiffResult` as `@blazediff/core`. Caller decodes images; no PNG/JPEG codecs bundled
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
    'https://cdn.jsdelivr.net/npm/@blazediff/core-wasm@7.0.0/wasm/blazediff_bg.wasm',
  ),
);
```

Pin the version (`@7.0.0`). It must match the installed package, because the JS glue and the `.wasm` change together. `unpkg.com/@blazediff/core-wasm@7.0.0/wasm/blazediff_bg.wasm` works identically.

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

### `diff(a, b, options?)`

Compares two RGBA images. Takes and returns the same types as [`@blazediff/core`](https://www.npmjs.com/package/@blazediff/core)'s `diff`, which they are imported from.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>a</code>, <code>b</code></td>
    <td>Image</td>
    <td><code>{ data, width, height }</code> with RGBA8 pixels (<code>width * height * 4</code> bytes). Browser <code>ImageData</code> fits as is</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>DiffOptions</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

**Returns:** `Promise<DiffResult>`

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
    <td>Color difference threshold (0-1). Lower is stricter</td>
  </tr>
  <tr>
    <td><code>antialiasing</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Detect anti-aliased pixels and leave them out of the count</td>
  </tr>
  <tr>
    <td><code>metric</code></td>
    <td>"yiq" | "oklab"</td>
    <td>"yiq"</td>
    <td>Color difference metric. <code>oklab</code> gives the same counts as pixelmatch 8</td>
  </tr>
  <tr>
    <td><code>mask</code></td>
    <td>Uint8Array</td>
    <td>-</td>
    <td>One byte per pixel (width × height). Non-zero pixels are skipped</td>
  </tr>
  <tr>
    <td><code>window</code></td>
    <td>number</td>
    <td>-</td>
    <td>Also report the N×N window with the most diff pixels</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Image</td>
    <td>-</td>
    <td>Draw the diff into this image in place. Identical images leave it unwritten</td>
  </tr>
  <tr>
    <td><code>render</code></td>
    <td>{ alpha?, diffColor?, diffColorAlt?, aaColor?, background? }</td>
    <td>-</td>
    <td>Output styling. <code>background: "transparent"</code> draws the diff alone</td>
  </tr>
</table>

```typescript
type DiffResult =
  | {
      kind: "compared";
      count: number;
      percentage: number;
      identical: boolean;
      /** Top-left corner and count of the busiest window, when `window` is set. */
      window?: { x: number; y: number; count: number };
    }
  | { kind: "dimension-mismatch"; a: Size; b: Size };
```

Invalid options or buffers reject with a `BlazeDiffError` that has a `code`: `invalid-image`, `invalid-output`, `invalid-mask` or `invalid-option`.

```typescript
const result = await diff(a, b, {
  output: { data: out, width, height },
  render: { diffColorAlt: [0, 128, 255] },
});
```

Region analysis — *what* changed rather than where — is no longer part of this
package. It lives in
[`@blazediff/interpret-native`](https://www.npmjs.com/package/@blazediff/interpret-native),
which is a Node N-API package and has no wasm build.

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
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}

const a = await toRgba('/baseline.png');
const b = await toRgba('/current.png');
const output = new ImageData(a.width, a.height);

const result = await diff(a, b, { output, threshold: 0.1 });

if (result.kind === 'compared') console.log(`${result.count} pixels differ`);
```

### Node

```typescript
import { readFileSync } from 'node:fs';
import { diff, initBlazediff } from '@blazediff/core-wasm';
import { PNG } from 'pngjs';

await initBlazediff(
  new URL(
    'https://cdn.jsdelivr.net/npm/@blazediff/core-wasm@7.0.0/wasm/blazediff_bg.wasm',
  ),
);

const a = PNG.sync.read(readFileSync('baseline.png'));
const b = PNG.sync.read(readFileSync('current.png'));
const result = await diff(a, b);
```

## Performance

vs `pixelmatch` on Linux x64 (Intel Xeon Platinum 8581C), image I/O excluded (pre-decoded RGBA buffers):

| Fixture       | pixelmatch | core-wasm | Improvement |
|---------------|------------|-----------|-------------|
| 4k/1 | 327.33ms | 57.49ms | **82.4%** |
| 4k/3 | 422.67ms | 81.60ms | **80.7%** |
| page/2 | 498.86ms | 119.82ms | **76.0%** |
| blazediff/3 | 11.90ms | 7.73ms | **35.0%** |
| pixelmatch/1 | 0.68ms | 0.12ms | **81.8%** |

About **3.8x** faster in total time across the full fixture set, ~68% per fixture on average (~57% across differing pairs). Counts agree with pixelmatch within ~0.05% (e.g. `4k/1`: 69 932 vs 69 912 of 17 920 000 pixels).
 Full benchmarks in [BENCHMARKS.md](https://github.com/teimurjan/blazediff/blob/main/BENCHMARKS.md).

## Algorithm

Same block-band approach as `@blazediff/core-native`, recompiled for wasm. The diff walks one row of blocks at a time. The block size grows with the image area, from 8 to 128 pixels.

1. **Cold pass:** a SIMD scan reads the band in pixel-row order and flags each block that holds a pixel over the threshold
2. **Hot pass:** YIQ perceptual color difference on the flagged blocks only, while the band is still in cache
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
