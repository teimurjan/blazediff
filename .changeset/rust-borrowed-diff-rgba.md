---
"@blazediff/rust": minor
"@blazediff/rust-shared": patch
---

Add `diff_rgba` and `ImageView`, so Rust callers can diff RGBA8 bytes they already hold without copying them into an `Image`. Examples are a framebuffer readback or a memory-mapped file. Counts and output bytes are the same as `diff`. With `default-features = false`, `blazediff` now depends only on `blazediff-shared`, `bytemuck` and `serde`. `napi-build` is a build-dependency of the `napi` feature only, `serde_json` belongs to the `cli` feature, and the unused `base64` and `pkg-config` are gone. `blazediff-shared` pulls in `cc` and `cmake` only with the `spng` or `codecs` feature.
