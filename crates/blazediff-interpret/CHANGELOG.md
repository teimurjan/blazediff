# @blazediff/rust-interpret

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

### Minor Changes

- 322aeab: Ship `blazediff-ssim` and `blazediff-interpret` to PyPI. Python could only pixel-diff: the SSIM family and the region classifier reached Node through `@blazediff/ssim-native` and `@blazediff/interpret-native` and Rust through their crates, but had no wheel. Both crates gain a `python` Cargo feature and a `src/python.rs` ported one-for-one from their `napi.rs` — `compare` / `compare_buffers` / `compare_rgba` / `render_map` / `metrics` for ssim, `interpret_images` / `interpret_buffers` / `interpret_ssim` / `interpret_regions` for interpret — with the nested N-API option objects flattened into keyword arguments and `InterpretResult` crossing as a dict via `pythonize`.

  The release path stopped hardcoding one distribution: `sync-pyproject-version.js`, `publish-pypi.js`, `publish-pypi.yml` (now taking a `package` input), `build-artifacts.yml` and `release-artifacts-check.yml` all run over three `{crate, wheels dir, version}` entries, each gated on its own family's flag rather than on `core`. The maturin cross/zig/xwin matrix moved to `crates/scripts/build-maturin.sh` behind per-crate shims, mirroring `build-napi.sh`, and gained `--no-sync` so a host build can't overwrite a committed six-platform set.

  Nothing in CI imported a built wheel before, so a broken `#[pymodule]` would have shipped. `test.yml` now runs `cargo check --features python` for all three crates and `pnpm test:python`, which builds each wheel for the host and runs a pytest suite against the installed module.

## 6.2.0

### Minor Changes

- 5b9f7f8: Density-gate the region bbox merge so distinct nearby changes stay separate. Proximity-only merging chained neighbouring edits on dense screenshots — a map's whole lower half collapsed into one `ContentChange` that hid the additions and deletions inside it. A merge is now refused unless the enclosing box is mostly touched by a sub-threshold change-density map, which keeps one fragmented change together while splitting two changes with untouched background between them. `merge_overlapping_components` takes a `&ChangeDensity` argument. End-to-end macro F1: shift 0.799 → 0.801, inpaintcoco 0.488 → 0.492, addition_deletion unchanged, html_color_pairs 0.874 → 0.868.

## 6.1.0

### Minor Changes

- 2d09fea: Interpret accuracy overhaul: chroma-plane statistics on every region (`chroma`) and raw background distances in signals; chroma-coherence recolor rules for photographic edits; patch-correlation shift matching; census-scaled detection noise floor with fragment merging and margined bboxes. Verification macro F1 (classifier-only): addition_deletion 0.998 → 1.000, shift 0.813 → 1.000, html_color_pairs 0.993 → 1.000, inpaintcoco 0.440 → 0.718; end-to-end error cut ≥ 40% on every dataset.

## 6.0.0
