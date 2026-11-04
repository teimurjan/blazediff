# @blazediff/core

## 2.0.0

### Major Changes

- 6b605d4: One diff API across JS, wasm, native, Rust, Python and both CLIs. `diff(a, b, options)` takes `{ data, width, height }` images and returns a result object: `{ kind: "compared", count, percentage, identical, window? }`, or `{ kind: "dimension-mismatch", a, b }` instead of a throw. Options use the same names everywhere: `threshold`, `antialiasing`, `metric`, `mask`, `window`, `output` and `render`. Anti-aliasing detection is on by default on every surface. `metric` is `"yiq"` or `"oklab"`. `render` holds `alpha`, `diffColor`, `diffColorAlt`, `aaColor` and `background`. `metric: "oklab"`, `mask` and `window` give the same counts and diff images as pixelmatch 8.0.0, and `window` also reports where the busiest window is. `@blazediff/core/pixelmatch` is a drop-in pixelmatch 8 replacement. `core-native` `compare()` becomes `diff()`, takes raw RGBA images besides paths and encoded bytes, and reports `kind: "io-error"` instead of `file-not-exists`. Native, Python and the native CLI now detect anti-aliasing by default. The matcher groups method options under `diff`, `ssim` and `gmsd`, and `core-native` accepts in-memory images. The UI and React difference modes take `antialiasing` instead of `includeAA`. `ssim`, `msssim`, `hitchhikersSSIM` and `gmsd` take images and an options object and return a result object. Default YIQ counts and diff images are unchanged for the same effective options. See the migration guide at https://blazediff.dev/docs/migrating. The `blazediff-interpret` Rust crate takes the new `DiffOptions`. Its JS, Python and wasm options do not change.

## 1.10.0

### Minor Changes

- 7a377ed: Reject below-threshold pixels with integer math before the YIQ pipeline

  The YIQ metric is a positive-definite quadratic form, so `Δr² + Δg² + Δb² ≤
maxDelta / λmax` proves a pixel is under threshold without running the float
  metric. Opaque pixels also read their channels out of the 32-bit word already
  loaded for the equality test. Diff counts and output images are unchanged.

## 1.9.3

### Patch Changes

- 87cf7cc: Fix crash when `null` is passed as the output buffer. `diff` now treats `null` and `undefined` identically (count-only), matching pixelmatch's API.

## 1.9.2

### Patch Changes

- f0c3b78: Speed up core with single pass on no output

## 1.9.1

### Patch Changes

- 7166ff6: Remove duplicated .d.mts type declaration files

## 1.9.0

### Minor Changes

- a0fc05f: Better JIT optimization for color delta

## 1.8.0

### Minor Changes

- 499b4d3: Ensure fast path compares both bytes and color delta

## 1.7.0

### Minor Changes

- a06efeb: Add named exports

## 1.6.0

## 1.5.0

### Minor Changes

- 967eb66: Remove @blazediff/types to keep zero deps

## 1.4.1

### Patch Changes

- Updated dependencies [90cb795]
- Updated dependencies [61003dd]
  - @blazediff/types@1.4.1

## 1.4.0

### Minor Changes

- 5719109: Remove drawing pixels when no output, yet images are identical

### Patch Changes

- @blazediff/types@1.4.0

## 1.3.0

### Minor Changes

- 24d135a: Store changed block coordinates in one array for better cache loyalty

### Patch Changes

- @blazediff/types@1.3.0

## 1.2.0

### Minor Changes

- 630dd96: Optimize block coordinates storage

### Patch Changes

- @blazediff/types@1.2.0

## 1.1.0

### Minor Changes

- 4bab346: Ensure the output image for identical images is gray

### Patch Changes

- @blazediff/types@1.1.0

## 1.0.0

### Major Changes

- ba6eb13: Introduce fast buffer compare check for identical images

### Patch Changes

- Updated dependencies [ba6eb13]
  - @blazediff/types@1.0.0

## 0.7.2

### Patch Changes

- df3029a: Update READMEs on NPM
- Updated dependencies [df3029a]
  - @blazediff/types@0.7.2

## 0.7.1

### Patch Changes

- f61a7ca: Added JIT optimizations giving 3% performance boost
  - @blazediff/types@0.7.1

## 0.7.0

### Minor Changes

- 1917cc9: Ensure types are listed in the dependencies

### Patch Changes

- @blazediff/types@0.7.0

## 0.6.0

## 0.5.0

### Minor Changes

- b9e10a7: Remove YCbCr in favor of one color space performance

## 0.4.0

### Minor Changes

- 8a82cd6: Add yiq color delta option to be compatible with pixelmatch

## 0.3.0

### Minor Changes

- a6673c8: Change FXAA to YCbCr in favor of accuracy

## 0.2.0

### Minor Changes

- 82ad5fb: Replace YIQ color delta with fast approximate anti-aliasing (FXAA)

## 0.1.0
