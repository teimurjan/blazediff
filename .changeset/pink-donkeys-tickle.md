---
"@blazediff/interpret-native": minor
"@blazediff/rust-interpret": minor
---

Add `@blazediff/interpret-wasm`, a wasm32 build of the interpret classifier for
browsers and any other wasm host, and make region ordering deterministic.

The new package mirrors `@blazediff/core-wasm`: a buffers-only `interpret()`
over RGBA8 input, no bundled codecs, and the same result shape
`@blazediff/interpret-native` returns. It is backed by a new `wasm` feature on
the `blazediff-interpret` crate, which required making the crate's image I/O
optional — `io` is now its own feature that `napi`, `python` and `cli` enable,
so the wasm build links none of the vendored C.

`extract_labeled_regions` keyed its components by a `HashMap` and iterated it,
so two regions with equal `pixelCount` came back in a per-process random order.
That leaked into `regions` and into the summary's position list, making
identical inputs produce different output between runs. It is now a `BTreeMap`,
so ties resolve in raster order.
