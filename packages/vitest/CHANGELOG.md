# @blazediff/vitest

## 2.0.0

### Major Changes

- 74b2769: One diff API across JS, wasm, native, Rust, Python and both CLIs. `diff(a, b, options)` takes `{ data, width, height }` images and returns a result object: `{ kind: "compared", count, percentage, identical, window? }`, or `{ kind: "dimension-mismatch", a, b }` instead of a throw. Options use the same names everywhere: `threshold`, `antialiasing`, `metric`, `mask`, `window`, `output` and `render`. Anti-aliasing detection is on by default on every surface. `metric` is `"yiq"` or `"oklab"`. `render` holds `alpha`, `diffColor`, `diffColorAlt`, `aaColor` and `background`. `metric: "oklab"`, `mask` and `window` give the same counts and diff images as pixelmatch 8.0.0, and `window` also reports where the busiest window is. `@blazediff/core/pixelmatch` is a drop-in pixelmatch 8 replacement. `core-native` `compare()` becomes `diff()`, takes raw RGBA images besides paths and encoded bytes, and reports `kind: "io-error"` instead of `file-not-exists`. Native, Python and the native CLI now detect anti-aliasing by default. The matcher groups method options under `diff`, `ssim` and `gmsd`, and `core-native` accepts in-memory images. The UI and React difference modes take `antialiasing` instead of `includeAA`. `ssim`, `msssim`, `hitchhikersSSIM` and `gmsd` take images and an options object and return a result object. Default YIQ counts and diff images are unchanged for the same effective options. The `blazediff-interpret` Rust crate takes the new `DiffOptions`. Its JS, Python and wasm options do not change. See the migration guide at https://blazediff.dev/docs/migrating.

### Patch Changes

- Updated dependencies [74b2769]
  - @blazediff/matcher@3.0.0

## 1.1.26

### Patch Changes

- @blazediff/matcher@2.0.8

## 1.1.25

### Patch Changes

- @blazediff/matcher@2.0.7

## 1.1.24

### Patch Changes

- @blazediff/matcher@2.0.6

## 1.1.23

### Patch Changes

- @blazediff/matcher@2.0.5

## 1.1.22

### Patch Changes

- @blazediff/matcher@2.0.4

## 1.1.21

### Patch Changes

- @blazediff/matcher@2.0.3

## 1.1.20

### Patch Changes

- @blazediff/matcher@2.0.2

## 1.1.19

### Patch Changes

- @blazediff/matcher@2.0.1

## 1.1.18

### Patch Changes

- fc369d6: Drop the HTML diff output format. Removes `--output-format` from `blazediff-cli`, `outputFormat` from `@blazediff/core-native`'s `BlazeDiffOptions` and `@blazediff/matcher`'s `MatcherOptions`, and the embedded `html_report` module from the rust crate. The interpret report is now produced by `@blazediff/agent`'s review webapp instead of being inlined into the diff path. README docs for `bun`/`jest`/`vitest` are synced to match.
- Updated dependencies [fc369d6]
  - @blazediff/matcher@2.0.0

## 1.1.17

### Patch Changes

- @blazediff/matcher@1.5.4

## 1.1.16

### Patch Changes

- @blazediff/matcher@1.5.3

## 1.1.15

### Patch Changes

- @blazediff/matcher@1.5.2

## 1.1.14

### Patch Changes

- @blazediff/matcher@1.5.1

## 1.1.13

### Patch Changes

- Updated dependencies [345e842]
  - @blazediff/matcher@1.5.0

## 1.1.12

### Patch Changes

- @blazediff/matcher@1.4.2

## 1.1.11

### Patch Changes

- @blazediff/matcher@1.4.1

## 1.1.10

### Patch Changes

- Updated dependencies [a77d845]
  - @blazediff/matcher@1.4.0

## 1.1.9

### Patch Changes

- @blazediff/matcher@1.3.1

## 1.1.8

### Patch Changes

- cb66dd3: Add worker thread support for better performance

  - Add `runInWorker` option (default: `true`) to offload image I/O and comparison to worker threads
  - Direct PNG buffer write optimization for first-run snapshots
  - Fix ESM compatibility with proper `__dirname` shim
  - Graceful fallback to in-process execution when worker unavailable

- Updated dependencies [cb66dd3]
  - @blazediff/matcher@1.3.0

## 1.1.7

### Patch Changes

- @blazediff/matcher@1.2.5

## 1.1.6

### Patch Changes

- @blazediff/matcher@1.2.4

## 1.1.5

### Patch Changes

- @blazediff/matcher@1.2.3

## 1.1.4

### Patch Changes

- @blazediff/matcher@1.2.2

## 1.1.3

### Patch Changes

- 7166ff6: Remove duplicated .d.mts type declaration files
- Updated dependencies [7166ff6]
  - @blazediff/matcher@1.2.1

## 1.1.2

### Patch Changes

- Updated dependencies [386ba51]
  - @blazediff/matcher@1.2.0

## 1.1.1

### Patch Changes

- Updated dependencies [bef3829]
  - @blazediff/matcher@1.1.1

## 1.1.0

### Minor Changes

- fdb2fb3: Fix matchers to detect update request correctly

### Patch Changes

- Updated dependencies [fdb2fb3]
  - @blazediff/matcher@1.1.0

## 1.0.1

### Patch Changes

- @blazediff/matcher@1.0.1
