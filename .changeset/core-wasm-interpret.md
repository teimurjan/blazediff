---
"@blazediff/core-wasm": minor
---

Add `interpret` to the WebAssembly build.

`@blazediff/core-wasm` now exports `interpret(a, b, width, height, options?)`, the
semantic diff analysis that was previously native-only - it classifies each change
region (addition, deletion, shift, color change, …) with a position and severity.
It runs over pre-decoded RGBA buffers and returns the same shape as
`@blazediff/core-native`, so you can analyze image differences in the browser, a
Worker, or any edge runtime.
