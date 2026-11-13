# @blazediff/rust-shared

## 7.0.0

### Major Changes

- 0d8bbac: Breaking: `encode_png` takes `blazediff_png` compression levels. The Rust `encode_png(image, level)` now accepts levels 0 to 12 and returns an `ImageError::Png` for a negative level or a level over 12. Before, spng took -1 as the zlib default and 0 to 9 as zlib levels. If you passed -1, pass 6 for the old default. The same level number can now give a different speed and file size. The N-API and Python bindings take an unsigned level, so a negative level was never possible there.

## 6.0.0
