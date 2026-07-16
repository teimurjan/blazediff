# @blazediff/core-wasm

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
