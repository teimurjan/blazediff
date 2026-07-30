# @blazediff/core-wasm

## 5.4.0

### Minor Changes

- 7a377ed: Fix alpha blending to match `@blazediff/core`; 27-41% faster diff kernel

  **Diff counts change for images with an alpha channel.** Semi-transparent pixels
  were blended against white instead of the `FORMULA.md` checkerboard
  (`fixtures/pixelmatch/5`: 256 native vs 208 JS). Opaque images are unaffected, so
  most baselines will not move. A cross-engine parity suite now covers every fixture.

  Kernel: integer rejection before the YIQ float pipeline, one-branch skips over
  unchanged 16px runs, vectorized background writes, and no double buffer copy on
  wasm. Also fixes an out-of-bounds read in the AA sibling check that segfaulted on
  4K pairs with `-a -t 0`, and x86 background pixels rounding where scalar and NEON
  truncate.

## 5.3.0

## 5.2.0

### Minor Changes

- 44a5292: Allow WebAssembly `diff` to return interpretation and diff output from one pass, and make native combined comparison write its requested output.
- 44a5292: Add `diffColorAlt` for coloring darkening differences in native and WebAssembly diff output.

## 5.1.0

### Minor Changes

- 723e24c: Add `interpret` to the WebAssembly build.

  `@blazediff/core-wasm` now exports `interpret(a, b, width, height, options?)`, the
  semantic diff analysis that was previously native-only - it classifies each change
  region (addition, deletion, shift, color change, …) with a position and severity.
  It runs over pre-decoded RGBA buffers and returns the same shape as
  `@blazediff/core-native`, so you can analyze image differences in the browser, a
  Worker, or any edge runtime.

## 5.0.0

## 4.3.4

## 4.3.3

### Patch Changes

- f0c3b78: Optimize image decoding, output image generation

## 4.3.1

### Patch Changes

- 4dc5244: Clean up unsafe blocks

## 4.3.0

### Minor Changes

- 345e842: Add core-wasm support to Rust
