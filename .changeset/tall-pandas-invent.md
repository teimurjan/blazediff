---
"@blazediff/core-native": major
"@blazediff/core-wasm": major
"@blazediff/cli": major
"@blazediff/agent": minor
---

Interpretation moves to `@blazediff/interpret-native`, and the SSIM metrics to
`@blazediff/ssim-native`.

**Breaking.** `interpret()` is gone from `core-native` and `core-wasm`, along
with the `interpret` option on `compare()`/`diff()`, the `InterpretResult`,
`ChangeRegion`, `BoundingBox` and `DiffResult` types, the `interpretRgba` wasm
export, and the Python `interpret_images`. The CLI drops `core-native
--interpret` for a `blazediff-cli interpret` command, which adds a `--source`
choice of how regions are located: a pixel diff, or an SSIM map.
