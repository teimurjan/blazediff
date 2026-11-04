# @blazediff/core-native

## 7.0.0

### Major Changes

- 6b605d4: One diff API across JS, wasm, native, Rust, Python and both CLIs. `diff(a, b, options)` takes `{ data, width, height }` images and returns a result object: `{ kind: "compared", count, percentage, identical, window? }`, or `{ kind: "dimension-mismatch", a, b }` instead of a throw. Options use the same names everywhere: `threshold`, `antialiasing`, `metric`, `mask`, `window`, `output` and `render`. Anti-aliasing detection is on by default on every surface. `metric` is `"yiq"` or `"oklab"`. `render` holds `alpha`, `diffColor`, `diffColorAlt`, `aaColor` and `background`. `metric: "oklab"`, `mask` and `window` give the same counts and diff images as pixelmatch 8.0.0, and `window` also reports where the busiest window is. `@blazediff/core/pixelmatch` is a drop-in pixelmatch 8 replacement. `core-native` `compare()` becomes `diff()`, takes raw RGBA images besides paths and encoded bytes, and reports `kind: "io-error"` instead of `file-not-exists`. Native, Python and the native CLI now detect anti-aliasing by default. The matcher groups method options under `diff`, `ssim` and `gmsd`, and `core-native` accepts in-memory images. The UI and React difference modes take `antialiasing` instead of `includeAA`. `ssim`, `msssim`, `hitchhikersSSIM` and `gmsd` take images and an options object and return a result object. Default YIQ counts and diff images are unchanged for the same effective options. See the migration guide at https://blazediff.dev/docs/migrating. The `blazediff-interpret` Rust crate takes the new `DiffOptions`. Its JS, Python and wasm options do not change.

### Patch Changes

- Updated dependencies [6b605d4]
  - @blazediff/core@2.0.0

## 6.0.2

### Patch Changes

- e9d5472: Rebuild against the updated `blazediff-png` codec. With `BLAZEDIFF_PNG_ENABLED` set, PNG decode is faster, and a gray tRNS key is masked to the image bit depth as the PNG specification requires. The default spng path is unchanged.

## 6.0.1

## 6.0.0

### Major Changes

- 85f66f5: Interpretation moves to `@blazediff/interpret-native`, and the SSIM metrics to
  `@blazediff/ssim-native`.

  **Breaking.** `interpret()` is gone from `core-native` and `core-wasm`, along
  with the `interpret` option on `compare()`/`diff()`, the `InterpretResult`,
  `ChangeRegion`, `BoundingBox` and `DiffResult` types, the `interpretRgba` wasm
  export, and the Python `interpret_images`. The CLI drops `core-native
--interpret` for a `blazediff-cli interpret` command, which adds a `--source`
  choice of how regions are located: a pixel diff, or an SSIM map.

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

### Minor Changes

- 548266e: Accept encoded `Buffer` and `Uint8Array` inputs in `compare` and `interpret` without copying their JavaScript backing memory into Rust.

## 5.2.0

### Minor Changes

- 44a5292: Add `diffColorAlt` for coloring darkening differences in native and WebAssembly diff output.

### Patch Changes

- 44a5292: Allow WebAssembly `diff` to return interpretation and diff output from one pass, and make native combined comparison write its requested output.

## 5.1.0

### Minor Changes

- 27841f8: Add new blazediff-png crate for faster PNG encoding and decoding

## 5.0.0

### Major Changes

- fc369d6: Drop the HTML diff output format. Removes `--output-format` from `blazediff-cli`, `outputFormat` from `@blazediff/core-native`'s `BlazeDiffOptions` and `@blazediff/matcher`'s `MatcherOptions`, and the embedded `html_report` module from the rust crate. The interpret report is now produced by `@blazediff/agent`'s review webapp instead of being inlined into the diff path. README docs for `bun`/`jest`/`vitest` are synced to match.

## 4.3.4

### Patch Changes

- 351c995: Speed up interpret & improve verification pipeline

## 4.3.3

## 4.3.2

### Patch Changes

- 4dc5244: Clean up unsafe blocks

## 4.3.1

### Patch Changes

- 442d1ee: Rebuild Linux .node files without CPython symbol contamination so Node.js can dlopen them on Linux. Emit camelCase fields and kebab-case enum values from the CLI interpret JSON path so the `tryLoadNativeBinding` fallback parses into the typed `InterpretResult` shape.

## 4.3.0

### Minor Changes

- 345e842: Add core-wasm support to Rust

## 4.2.0

### Minor Changes

- 81086bd: Improve interpret classification with dual-image gradient comparison, color delta uniformity analysis, and expanded noise filtering. ColorChange detection now measures edge correlation between both images instead of single-image edge score. New `edge_score_img2`, `edge_correlation`, and `delta_stddev` fields in interpret output. Fix HTML report overlay extending past image bounds on bottom regions.

## 4.1.0

### Minor Changes

- a77d845: Add interpret option to inspect and report visual changes using heuristic

## 4.0.0

### Major Changes

- e6638e3: Rename bin and bin-_ to core-native-_, _-transformer to codec-_ for consistency

## 3.5.0

### Minor Changes

- d1ceb10: Add QOI format support

## 3.4.0

## 3.3.0

### Minor Changes

- 771607c: Fix outdated napi binaries

## 3.2.0

### Minor Changes

- db69eff: Remove fail on layout option from bin because we have layout check in the diff function anyway

## 3.1.1

### Patch Changes

- 7166ff6: Remove duplicated .d.mts type declaration files

## 3.1.0

### Minor Changes

- f3ff5dc: Add jpeg support
- f3ff5dc: Include N-API bindings to avoid spawning processes

## 3.0.0

### Major Changes

- 40ab514: Make platform-specific packages optionalDependencies

## 2.1.0

### Minor Changes

- 8c5b92d: Make diffOutput function argument optional

## 2.0.1

### Patch Changes

- de2a393: Fixed \_\_dirname not found

## 2.0.0

### Major Changes

- 499b4d3: Bin is using native Rust binaries now for maximum performance

  - Legacy `bin` package is the new `cli` package from now on
