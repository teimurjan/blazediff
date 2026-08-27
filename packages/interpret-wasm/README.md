# @blazediff/interpret-wasm

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Finterpret-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/interpret-wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Finterpret-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/interpret-wasm)
[![Crates.io](https://img.shields.io/crates/v/blazediff-interpret.svg?style=for-the-badge)](https://crates.io/crates/blazediff-interpret)

</div>

WebAssembly build of the BlazeDiff interpret classifier for browsers, edge runtimes, and any wasm host. Same deterministic pipeline as [`@blazediff/interpret-native`](https://www.npmjs.com/package/@blazediff/interpret-native), compiled to `wasm32` with `v128` SIMD (`+simd128`) — it takes a raw pixel diff and tells you *what* changed, where, and how much, as labelled regions rather than one number.

No model, no weights, no network call.

**Features:**
- Same Rust classifier as `@blazediff/interpret-native`, and the result shape is identical
- Six change labels: `addition`, `deletion`, `shift`, `color-change`, `content-change`, `rendering-noise`
- Buffers-only API: caller decodes images, hands in `Uint8Array`. No PNG/JPEG codecs bundled
- ~146 KB optimized wasm + ~12 KB JS glue. No native binaries, no postinstall, no platform packages
- Runs anywhere wasm runs: browsers, Node 18+, Cloudflare Workers, Deno, Bun

## Installation

```bash
npm install @blazediff/interpret-wasm
```

## Loading the wasm module

Identical to [`@blazediff/core-wasm`](https://www.npmjs.com/package/@blazediff/core-wasm) — the wasm-bindgen `--target web` glue fetches the sibling `.wasm` via `import.meta.url` automatically:

```typescript
import { initInterpret } from '@blazediff/interpret-wasm';
await initInterpret();
```

Pass a `URL`, `Response`, or raw bytes to load it from anywhere else:

```typescript
// Bundlers (Vite, Webpack 5+, esbuild) rewrite this at build time:
await initInterpret(
  new URL('@blazediff/interpret-wasm/wasm/blazediff_interpret_bg.wasm', import.meta.url),
);

// Node from the local filesystem:
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
await initInterpret(
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@blazediff/interpret-wasm/wasm/blazediff_interpret_bg.wasm',
    ),
  ),
);
```

`initInterpret()` is memoized — call it as often as you like, the module is instantiated once.

## Usage

Both buffers must be `width * height * 4` bytes in RGBA8 order.

```typescript
import { initInterpret, interpret } from '@blazediff/interpret-wasm';

await initInterpret();

const result = await interpret(rgbaA, rgbaB, width, height);

console.log(result.summary);
for (const region of result.regions) {
  console.log(`${region.position}: ${region.changeType} (${region.percentage.toFixed(2)}%)`);
}
```

Pass a fifth argument to keep the diff visualization. It must be `width * height * 4` bytes and is written in place:

```typescript
const output = new Uint8Array(width * height * 4);
await interpret(rgbaA, rgbaB, width, height, output);
```

Options go last:

```typescript
await interpret(rgbaA, rgbaB, width, height, undefined, {
  threshold: 0.1,      // color difference threshold (0-1). Default: 0.1
  antialiasing: false, // exclude anti-aliased pixels. Default: false
});
```

## Decoding images in the browser

This package bundles no codecs, so decode first. `ImageDecoder` (WebCodecs) has no canvas size cap and is the better path for large images:

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

Large pairs are worth running in a Web Worker: a 59 MP pair allocates roughly a gigabyte inside wasm, and wasm linear memory never shrinks — terminating the worker is the only way to give it back.

## Result shape

```typescript
interface InterpretResult {
  summary: string;
  diffCount: number;       // actually-changed pixels
  totalRegions: number;
  regions: ChangeRegion[];
  severity: string;        // "low" | "medium" | "high"
  diffPercentage: number;
  width: number;
  height: number;
}
```

Each `ChangeRegion` carries a `bbox`, `changeType`, `position`, `shape`, `percentage`, `pixelCount`, `confidence`, and the per-region evidence the classifier used (`chroma`, `colorDelta`, `gradient`, `shapeStats`, `signals`).

## Change types

| Type | Meaning |
|---|---|
| `addition` | Content appeared. Blends with the background in the before image, distinct in the after image. |
| `deletion` | Content was removed. Distinct before, blends with the background after. |
| `shift` | Content moved. Two regions whose before-crop and after-crop hold the same content. |
| `color-change` | A recolor. Luminance structure preserved under a color shift, or chroma moved coherently. |
| `content-change` | A structural change. Structure replaced and the chroma scattered rather than rotated. |
| `rendering-noise` | Sub-pixel artifacts. Filtered out of the output. |

## Documentation

Full write-up of the pipeline and accuracy numbers: [blazediff.dev/docs/difference-analysis](https://blazediff.dev/docs/difference-analysis).

## License

MIT
