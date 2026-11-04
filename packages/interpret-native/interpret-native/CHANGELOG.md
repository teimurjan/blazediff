# @blazediff/interpret-native

## 7.0.0

### Major Changes

- 74b2769: One diff API across JS, wasm, native, Rust, Python and both CLIs. `diff(a, b, options)` takes `{ data, width, height }` images and returns a result object: `{ kind: "compared", count, percentage, identical, window? }`, or `{ kind: "dimension-mismatch", a, b }` instead of a throw. Options use the same names everywhere: `threshold`, `antialiasing`, `metric`, `mask`, `window`, `output` and `render`. Anti-aliasing detection is on by default on every surface. `metric` is `"yiq"` or `"oklab"`. `render` holds `alpha`, `diffColor`, `diffColorAlt`, `aaColor` and `background`. `metric: "oklab"`, `mask` and `window` give the same counts and diff images as pixelmatch 8.0.0, and `window` also reports where the busiest window is. `@blazediff/core/pixelmatch` is a drop-in pixelmatch 8 replacement. `core-native` `compare()` becomes `diff()`, takes raw RGBA images besides paths and encoded bytes, and reports `kind: "io-error"` instead of `file-not-exists`. Native, Python and the native CLI now detect anti-aliasing by default. The matcher groups method options under `diff`, `ssim` and `gmsd`, and `core-native` accepts in-memory images. The UI and React difference modes take `antialiasing` instead of `includeAA`. `ssim`, `msssim`, `hitchhikersSSIM` and `gmsd` take images and an options object and return a result object. Default YIQ counts and diff images are unchanged for the same effective options. The `blazediff-interpret` Rust crate takes the new `DiffOptions`. Its JS, Python and wasm options do not change. See the migration guide at https://blazediff.dev/docs/migrating.

## 6.4.1

### Patch Changes

- e9d5472: Rebuild against the updated `blazediff-png` codec. With `BLAZEDIFF_PNG_ENABLED` set, PNG decode is faster, and a gray tRNS key is masked to the image bit depth as the PNG specification requires. The default spng path is unchanged.

## 6.4.0

### Minor Changes

- 544b45e: Add `@blazediff/interpret-wasm`, a wasm32 build of the interpret classifier for
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

## 6.3.0

## 6.2.0

### Minor Changes

- 5b9f7f8: Density-gate the region bbox merge so distinct nearby changes stay separate. Proximity-only merging chained neighbouring edits on dense screenshots — a map's whole lower half collapsed into one `ContentChange` that hid the additions and deletions inside it. A merge is now refused unless the enclosing box is mostly touched by a sub-threshold change-density map, which keeps one fragmented change together while splitting two changes with untouched background between them. `merge_overlapping_components` takes a `&ChangeDensity` argument. End-to-end macro F1: shift 0.799 → 0.801, inpaintcoco 0.488 → 0.492, addition_deletion unchanged, html_color_pairs 0.874 → 0.868.

## 6.1.0

### Minor Changes

- 2d09fea: Interpret accuracy overhaul: chroma-plane statistics on every region (`chroma`) and raw background distances in signals; chroma-coherence recolor rules for photographic edits; patch-correlation shift matching; census-scaled detection noise floor with fragment merging and margined bboxes. Verification macro F1 (classifier-only): addition_deletion 0.998 → 1.000, shift 0.813 → 1.000, html_color_pairs 0.993 → 1.000, inpaintcoco 0.440 → 0.718; end-to-end error cut ≥ 40% on every dataset.

## 6.0.0
