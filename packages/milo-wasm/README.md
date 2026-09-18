# @blazediff/milo-wasm

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fmilo-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/milo-wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fmilo-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/milo-wasm)
[![Crates.io](https://img.shields.io/crates/v/blazediff-milo.svg?style=for-the-badge)](https://crates.io/crates/blazediff-milo)

</div>

WebAssembly build of **MILO**, a learned perceptual image quality metric, for browsers, edge
runtimes, and any wasm host. Same crate as
[`@blazediff/milo-native`](https://www.npmjs.com/package/@blazediff/milo-native), compiled to
`wasm32` with `v128` SIMD (`+simd128`), weights included: it scores how visibly one image differs
from another, weighting each pixel's error by a predicted visibility mask, so an error hidden in
texture counts for less than the same error on a flat surface.

No network call, no model download: the 45k-parameter network ships inside the ~220 KB module.

**Features:**
- Same Rust metric as `@blazediff/milo-native`; the scores agree to floating-point noise
- Buffers-only API: caller decodes images, hands in `Uint8Array`. No PNG/JPEG codecs bundled
- ~220 KB optimized wasm + ~12 KB JS glue. No native binaries, no postinstall, no platform packages
- Runs anywhere wasm runs: browsers, Node 18+, Cloudflare Workers, Deno, Bun

## Installation

```bash
npm install @blazediff/milo-wasm
```

## Loading the wasm module

Identical to [`@blazediff/core-wasm`](https://www.npmjs.com/package/@blazediff/core-wasm): the
wasm-bindgen `--target web` glue fetches the sibling `.wasm` via `import.meta.url` automatically:

```typescript
import { initMilo } from '@blazediff/milo-wasm';
await initMilo();
```

Pass a `URL`, `Response`, or raw bytes to load it from anywhere else:

```typescript
// Bundlers (Vite, Webpack 5+, esbuild) rewrite this at build time:
await initMilo(
  new URL('@blazediff/milo-wasm/wasm/blazediff_milo_bg.wasm', import.meta.url),
);

// Node from the local filesystem:
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
await initMilo(
  readFileSync(
    createRequire(import.meta.url).resolve('@blazediff/milo-wasm/wasm/blazediff_milo_bg.wasm'),
  ),
);
```

`initMilo()` is memoized: call it as often as you like, the module is instantiated once.

## Usage

Both buffers must be `width * height * 4` bytes in RGBA8 order, at least 16px on each side.

```typescript
import { initMilo, milo } from '@blazediff/milo-wasm';

await initMilo();

const result = await milo(expectedRgba, actualRgba, width, height);

console.log(`raw error ${result.rawError}, MOS ${result.mos.toFixed(2)}`);
```

Pass `{ returnMaps: true }` to get the visibility mask and per-pixel error map back:

```typescript
const { mask, errorMap } = await milo(a, b, width, height, { returnMaps: true });
```

## The two numbers

- **`rawError`** is the metric: the mean over pixels and channels of `mask * |expected - actual|`.
  Exactly `0` for identical images and growing with visible damage; typical screenshot regressions
  land between 0.0002 and 0.01. Threshold on this.
- **`mos`** is `rawError` on KADID-10k's 1-5 mean-opinion-score scale, through the metric's learned
  calibration. It tops out around 4.35 rather than 5 for identical images, so read it, don't
  threshold it.

## Decoding images in the browser

This package bundles no codecs, so decode first. `ImageDecoder` (WebCodecs) has no canvas size cap
and is the better path for large images:

```typescript
async function toRgba(bytes: ArrayBuffer, type: string) {
  if (typeof ImageDecoder !== 'undefined' && (await ImageDecoder.isTypeSupported(type))) {
    const decoder = new ImageDecoder({ data: bytes, type });
    const { image } = await decoder.decode();
    const buffer = new Uint8Array(image.allocationSize({ format: 'RGBA' }));
    await image.copyTo(buffer, { format: 'RGBA' });
    const size = { width: image.displayWidth, height: image.displayHeight };
    image.close();
    decoder.close();
    return { ...size, data: buffer };
  }

  // Fallback. Note browsers cap canvas area (iOS Safari at ~16.7 MP).
  const bitmap = await createImageBitmap(new Blob([bytes], { type }));
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
  bitmap.close();
  return { width: canvas.width, height: canvas.height, data: new Uint8Array(data.buffer) };
}
```

## Cost

MILO is a convolutional network, about 116k floating-point operations per pixel, and wasm runs
it on one thread without fused multiply-add. Expect roughly 4 seconds for a 1468x294 pair and
proportionally more for larger images, so run it in a Web Worker and, where you can, choose the
native package. Memory stays flat (a few megabytes plus the two images) whatever the size, thanks
to the crate's line-buffer pipeline.

## Documentation

The metric, its accuracy against the reference PyTorch implementation and its weights'
Apache-2.0 attribution are documented in the
[`blazediff-milo`](https://crates.io/crates/blazediff-milo) crate.

## License

MIT. The embedded weights are Apache-2.0, copyright the MILO authors.
