# @blazediff/codec-png-wasm

## 6.1.1

### Patch Changes

- 0d8bbac: Faster palette encode. The palette scan writes each pixel's index into a preallocated buffer, and an uncompressed 8-bit palette PNG is written straight from those indices without an intermediate buffer. Encoding a 5600x3200 image with 30 colors takes about half the time. Output bytes do not change.

## 6.1.0

### Minor Changes

- 37b5015: Publish the `blazediff-png` codec to npm. `@blazediff/codec-png-native` is an N-API addon with prebuilt binaries for macOS, Linux and Windows on x64 and arm64. `@blazediff/codec-png-wasm` is the same codec as a 150 KB WebAssembly module for browsers, edge runtimes, Deno and Node.js. Both export `decode`, `encode` and a `{ read, write }` codec object with the same shape as `@blazediff/codec-pngjs`. The crate gains the `napi` and `wasm` features that build them.
