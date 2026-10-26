# @blazediff/codec-png-native

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcodec-png-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/codec-png-native)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcodec-png-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/codec-png-native)
[![Crates.io](https://img.shields.io/crates/v/blazediff-png.svg?style=for-the-badge)](https://crates.io/crates/blazediff-png)

</div>

The [`blazediff-png`](https://crates.io/crates/blazediff-png) Rust PNG codec for Node.js, through N-API. Decode output is byte-identical to libspng's RGBA8 output, and encode uses libdeflate.

```bash
npm install @blazediff/codec-png-native
```

The platform binary installs as an optional dependency, so there is no compile step. Prebuilt binaries cover macOS, Linux and Windows on x64 and arm64.

## Usage

```ts
import { decode, encode } from "@blazediff/codec-png-native";
import { readFileSync, writeFileSync } from "node:fs";

const image = decode(readFileSync("input.png")); // { data, width, height }, RGBA8
writeFileSync("output.png", encode(image, { compression: 6 }));
```

`decode` reads every PNG format: bit depths 1 to 16, palette, grayscale, transparency and Adam7 interlacing. It always returns RGBA8.

## Encode options

```ts
{
  compression?: number, // 0 = stored (no compression, fastest), 1-12 = libdeflate level. Default: 4
  filter?: "none" | "sub" | "up" | "average" | "paeth" | "adaptive", // Default: "adaptive"
  color?: "auto" | "rgba8", // Default: "auto"
}
```

With `color: "auto"` the encoder picks the smallest lossless color mode for the pixels. For example, an opaque image is written without its alpha channel. `color: "rgba8"` skips that scan and writes RGBA8 as given, which is the fastest encode.

## Codec interface

`codecPngNative` (also the default export) has the same `read` / `write` shape as `@blazediff/codec-pngjs` and `@blazediff/codec-sharp`, so it can replace them:

```ts
import { codecPngNative } from "@blazediff/codec-png-native";

const image = await codecPngNative.read("input.png");
await codecPngNative.write(image, "output.png");
```

## Related

- [`@blazediff/codec-png-wasm`](https://www.npmjs.com/package/@blazediff/codec-png-wasm): the same codec as WebAssembly, for browsers and edge runtimes.
- [Benchmarks](https://blazediff.dev/benchmarks#png-codec): decode and encode times against spng, image-rs, zune-png and jSquash.

## License

MIT
