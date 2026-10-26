---
"@blazediff/codec-png-native": minor
"@blazediff/codec-png-wasm": minor
"@blazediff/rust-png": minor
---

Publish the `blazediff-png` codec to npm. `@blazediff/codec-png-native` is an N-API addon with prebuilt binaries for macOS, Linux and Windows on x64 and arm64. `@blazediff/codec-png-wasm` is the same codec as a 150 KB WebAssembly module for browsers, edge runtimes, Deno and Node.js. Both export `decode`, `encode` and a `{ read, write }` codec object with the same shape as `@blazediff/codec-pngjs`. The crate gains the `napi` and `wasm` features that build them.
