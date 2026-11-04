# @blazediff/matcher

## 3.0.0

### Major Changes

- 6b605d4: One diff API across JS, wasm, native, Rust, Python and both CLIs. `diff(a, b, options)` takes `{ data, width, height }` images and returns a result object: `{ kind: "compared", count, percentage, identical, window? }`, or `{ kind: "dimension-mismatch", a, b }` instead of a throw. Options use the same names everywhere: `threshold`, `antialiasing`, `metric`, `mask`, `window`, `output` and `render`. Anti-aliasing detection is on by default on every surface. `metric` is `"yiq"` or `"oklab"`. `render` holds `alpha`, `diffColor`, `diffColorAlt`, `aaColor` and `background`. `metric: "oklab"`, `mask` and `window` give the same counts and diff images as pixelmatch 8.0.0, and `window` also reports where the busiest window is. `@blazediff/core/pixelmatch` is a drop-in pixelmatch 8 replacement. `core-native` `compare()` becomes `diff()`, takes raw RGBA images besides paths and encoded bytes, and reports `kind: "io-error"` instead of `file-not-exists`. Native, Python and the native CLI now detect anti-aliasing by default. The matcher groups method options under `diff`, `ssim` and `gmsd`, and `core-native` accepts in-memory images. The UI and React difference modes take `antialiasing` instead of `includeAA`. `ssim`, `msssim`, `hitchhikersSSIM` and `gmsd` take images and an options object and return a result object. Default YIQ counts and diff images are unchanged for the same effective options. See the migration guide at https://blazediff.dev/docs/migrating. The `blazediff-interpret` Rust crate takes the new `DiffOptions`. Its JS, Python and wasm options do not change.

### Patch Changes

- Updated dependencies [6b605d4]
  - @blazediff/core@2.0.0
  - @blazediff/core-native@7.0.0
  - @blazediff/ssim@2.0.0
  - @blazediff/gmsd@2.0.0
  - @blazediff/core-wasm@7.0.0

## 2.0.8

### Patch Changes

- Updated dependencies [e9d5472]
  - @blazediff/core-native@6.0.2
  - @blazediff/core-wasm@6.0.2

## 2.0.7

### Patch Changes

- @blazediff/core-native@6.0.1
- @blazediff/core-wasm@6.0.1

## 2.0.6

### Patch Changes

- Updated dependencies [85f66f5]
  - @blazediff/core-native@6.0.0
  - @blazediff/core-wasm@6.0.0

## 2.0.5

### Patch Changes

- Updated dependencies [7a377ed]
- Updated dependencies [7a377ed]
  - @blazediff/core-native@5.4.0
  - @blazediff/core-wasm@5.4.0
  - @blazediff/core@1.10.0

## 2.0.4

### Patch Changes

- Updated dependencies [548266e]
  - @blazediff/core-native@5.3.0
  - @blazediff/core-wasm@5.3.0

## 2.0.3

### Patch Changes

- Updated dependencies [44a5292]
- Updated dependencies [44a5292]
  - @blazediff/core-native@5.2.0
  - @blazediff/core-wasm@5.2.0

## 2.0.2

### Patch Changes

- Updated dependencies [723e24c]
- Updated dependencies [27841f8]
  - @blazediff/core-wasm@5.1.0
  - @blazediff/core-native@5.1.0

## 2.0.1

### Patch Changes

- Updated dependencies [87cf7cc]
  - @blazediff/core@1.9.3

## 2.0.0

### Major Changes

- fc369d6: Drop the HTML diff output format. Removes `--output-format` from `blazediff-cli`, `outputFormat` from `@blazediff/core-native`'s `BlazeDiffOptions` and `@blazediff/matcher`'s `MatcherOptions`, and the embedded `html_report` module from the rust crate. The interpret report is now produced by `@blazediff/agent`'s review webapp instead of being inlined into the diff path. README docs for `bun`/`jest`/`vitest` are synced to match.

### Patch Changes

- Updated dependencies [fc369d6]
  - @blazediff/core-native@5.0.0
  - @blazediff/core-wasm@5.0.0

## 1.5.4

### Patch Changes

- Updated dependencies [351c995]
  - @blazediff/core-native@4.3.4
  - @blazediff/core-wasm@4.3.4

## 1.5.3

### Patch Changes

- Updated dependencies [f0c3b78]
- Updated dependencies [f0c3b78]
  - @blazediff/core@1.9.2
  - @blazediff/core-wasm@4.3.3
  - @blazediff/core-native@4.3.3

## 1.5.2

### Patch Changes

- Updated dependencies [4dc5244]
  - @blazediff/core-native@4.3.2
  - @blazediff/core-wasm@4.3.1

## 1.5.1

### Patch Changes

- Updated dependencies [442d1ee]
  - @blazediff/core-native@4.3.1
  - @blazediff/core-wasm@4.3.0

## 1.5.0

### Minor Changes

- 345e842: Add core-wasm support to Rust

### Patch Changes

- Updated dependencies [345e842]
  - @blazediff/core-native@4.3.0
  - @blazediff/core-wasm@4.3.0

## 1.4.2

### Patch Changes

- Updated dependencies [81086bd]
  - @blazediff/core-native@4.2.0

## 1.4.1

### Patch Changes

- Updated dependencies [ad45341]
  - @blazediff/codec-pngjs@4.0.0
  - @blazediff/gmsd@1.7.1
  - @blazediff/ssim@1.7.1

## 1.4.0

### Minor Changes

- a77d845: Add interpret option to inspect and report visual changes using heuristic

### Patch Changes

- Updated dependencies [a77d845]
  - @blazediff/core-native@4.1.0

## 1.3.1

### Patch Changes

- Updated dependencies [e6638e3]
  - @blazediff/codec-pngjs@3.0.0
  - @blazediff/core-native@4.0.0
  - @blazediff/gmsd@1.7.1
  - @blazediff/ssim@1.7.1

## 1.3.0

### Minor Changes

- cb66dd3: Add worker thread support for better performance

  - Add `runInWorker` option (default: `true`) to offload image I/O and comparison to worker threads
  - Direct PNG buffer write optimization for first-run snapshots
  - Fix ESM compatibility with proper `__dirname` shim
  - Graceful fallback to in-process execution when worker unavailable

## 1.2.5

### Patch Changes

- Updated dependencies [d1ceb10]
  - @blazediff/bin@3.5.0

## 1.2.4

### Patch Changes

- @blazediff/bin@3.4.0

## 1.2.3

### Patch Changes

- Updated dependencies [771607c]
  - @blazediff/bin@3.3.0

## 1.2.2

### Patch Changes

- Updated dependencies [db69eff]
  - @blazediff/bin@3.2.0

## 1.2.1

### Patch Changes

- 7166ff6: Remove duplicated .d.mts type declaration files
- Updated dependencies [7166ff6]
  - @blazediff/core@1.9.1
  - @blazediff/bin@3.1.1
  - @blazediff/gmsd@1.7.1
  - @blazediff/pngjs-transformer@2.1.1
  - @blazediff/ssim@1.7.1

## 1.2.0

### Minor Changes

- 386ba51: Support raw PNG Buffer input in toMatchImageSnapshot()

  - Add support for passing raw PNG Buffers directly (like `canvas.toBuffer('png')`)
  - Raw PNG buffers are automatically decoded to extract dimensions
  - New `isRawPngBuffer()` type guard exported for detecting raw PNG input
  - Fix: `updateSnapshots: 'all'` now only updates when images actually differ (skips identical snapshots)

## 1.1.1

### Patch Changes

- bef3829: Fix snapshot update mode logic to prevent automatic updates without -u flag

## 1.1.0

### Minor Changes

- fdb2fb3: Fix matchers to detect update request correctly

## 1.0.1

### Patch Changes

- Updated dependencies [9d6d1c5]
  - @blazediff/pngjs-transformer@2.1.0
  - @blazediff/gmsd@1.7.0
  - @blazediff/ssim@1.7.0
