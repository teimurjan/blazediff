# @blazediff/rust-shared

## 7.0.1

### Patch Changes

- 3e511fc: Add `diff_rgba` and `ImageView`, so Rust callers can diff RGBA8 bytes they already hold without copying them into an `Image`. Examples are a framebuffer readback or a memory-mapped file. Counts and output bytes are the same as `diff`. With `default-features = false`, `blazediff` now depends only on `blazediff-shared`, `bytemuck` and `serde`. `napi-build` is a build-dependency of the `napi` feature only, `serde_json` belongs to the `cli` feature, and the unused `base64` and `pkg-config` are gone. `blazediff-shared` pulls in `cc` and `cmake` only with the `spng` or `codecs` feature.

## 7.0.0

### Major Changes

- 0d8bbac: Breaking: `encode_png` takes `blazediff_png` compression levels. The Rust `encode_png(image, level)` now accepts levels 0 to 12 and returns an `ImageError::Png` for a negative level or a level over 12. Before, spng took -1 as the zlib default and 0 to 9 as zlib levels. If you passed -1, pass 6 for the old default. The same level number can now give a different speed and file size. The N-API and Python bindings take an unsigned level, so a negative level was never possible there.

## 6.0.0
