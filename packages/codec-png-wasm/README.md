# @blazediff/codec-png-wasm

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcodec-png-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/codec-png-wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcodec-png-wasm?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/codec-png-wasm)
[![Crates.io](https://img.shields.io/crates/v/blazediff-png.svg?style=for-the-badge)](https://crates.io/crates/blazediff-png)

</div>

The [`blazediff-png`](https://crates.io/crates/blazediff-png) Rust PNG codec compiled to WebAssembly, for browsers, edge runtimes, Deno and Node.js. The module is about 150 KB and uses wasm SIMD.

```bash
npm install @blazediff/codec-png-wasm
```

## Usage

```ts
import { decode, encode } from "@blazediff/codec-png-wasm";

const bytes = new Uint8Array(await (await fetch("/input.png")).arrayBuffer());
const image = await decode(bytes); // { data, width, height }, RGBA8
const png = await encode(image, { compression: 0 });
```

`decode` reads every PNG format: bit depths 1 to 16, palette, grayscale, transparency and Adam7 interlacing. It always returns RGBA8.

The first call loads the bundled `wasm/blazediff_png_bg.wasm`. If you serve the module from somewhere else, for example a CDN, call `initCodecPngWasm` first:

```ts
import { initCodecPngWasm } from "@blazediff/codec-png-wasm";

await initCodecPngWasm(new URL("https://cdn.example.com/blazediff_png_bg.wasm"));
```

## Encode options

```ts
{
  compression?: number, // 0 = stored (no compression, fastest). 1-12 compress. Default: 4
  filter?: "none" | "sub" | "up" | "average" | "paeth" | "adaptive", // Default: "adaptive"
  color?: "auto" | "rgba8", // Default: "auto"
}
```

The wasm build uses a pure-Rust deflate (fdeflate), so every level from 1 to 12 runs the same fast compression mode. If you need libdeflate's higher levels, use `@blazediff/codec-png-native`. With `color: "auto"` the encoder picks the smallest lossless color mode. `color: "rgba8"` skips that scan and writes RGBA8 as given, which is the fastest encode.

## Codec interface

`codecPngWasm` (also the default export) has the same `read` / `write` shape as `@blazediff/codec-pngjs`. File paths need a runtime with `node:fs`. In a browser, pass bytes to `read`, or call `decode` and `encode` directly.

```ts
import { codecPngWasm } from "@blazediff/codec-png-wasm";

const image = await codecPngWasm.read("input.png");
await codecPngWasm.write(image, "output.png");
```

## Related

- [`@blazediff/codec-png-native`](https://www.npmjs.com/package/@blazediff/codec-png-native): the same codec as a native Node.js addon, with libdeflate encode.
- [Benchmarks](https://blazediff.dev/benchmarks#png-codec-wasm): decode and encode times in WebAssembly against zune-png and jSquash.

## License

MIT
