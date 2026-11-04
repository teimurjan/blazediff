---
"@blazediff/core": minor
"@blazediff/core-native": minor
"@blazediff/cli": minor
---

Add three optional diff options from pixelmatch 8. `colorSpace: "oklab"` compares colors with the OKLab HyAB metric and gives the same counts and diff images as pixelmatch 8.0.0. `ignoreMask` skips pixels (one byte per pixel, non-zero means skip). `windowSize` returns the largest diff count in any N×N window instead of the total. The default YIQ path and its results are unchanged. The JS, native and wasm packages take the same option names. The Rust crate and Python use `color_space`, `ignore_mask` and `window_size`. Both CLIs take `--color-space`, `--ignore-mask` and `--window-size`.
