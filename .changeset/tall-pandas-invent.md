---
"@blazediff/core-native": minor
"@blazediff/core-wasm": minor
"@blazediff/cli": minor
"@blazediff/agent": minor
---

Interpretation moves to `@blazediff/interpret-native`, and the SSIM metrics to
`@blazediff/ssim-native`.

`interpret()` is gone from `core-native` and `core-wasm`. The CLI drops
`core-native --interpret` for a `blazediff-cli interpret` command, which adds a
`--source` choice of how regions are located: a pixel diff, or an SSIM map.
