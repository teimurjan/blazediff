# @blazediff/rust

## 6.0.1

### Patch Changes

- 322aeab: Ship `blazediff-ssim` and `blazediff-interpret` to PyPI. Python could only pixel-diff: the SSIM family and the region classifier reached Node through `@blazediff/ssim-native` and `@blazediff/interpret-native` and Rust through their crates, but had no wheel. Both crates gain a `python` Cargo feature and a `src/python.rs` ported one-for-one from their `napi.rs` — `compare` / `compare_buffers` / `compare_rgba` / `render_map` / `metrics` for ssim, `interpret_images` / `interpret_buffers` / `interpret_ssim` / `interpret_regions` for interpret — with the nested N-API option objects flattened into keyword arguments and `InterpretResult` crossing as a dict via `pythonize`.

  The release path stopped hardcoding one distribution: `sync-pyproject-version.js`, `publish-pypi.js`, `publish-pypi.yml` (now taking a `package` input), `build-artifacts.yml` and `release-artifacts-check.yml` all run over three `{crate, wheels dir, version}` entries, each gated on its own family's flag rather than on `core`. The maturin cross/zig/xwin matrix moved to `crates/scripts/build-maturin.sh` behind per-crate shims, mirroring `build-napi.sh`, and gained `--no-sync` so a host build can't overwrite a committed six-platform set.

  Nothing in CI imported a built wheel before, so a broken `#[pymodule]` would have shipped. `test.yml` now runs `cargo check --features python` for all three crates and `pnpm test:python`, which builds each wheel for the host and runs a pytest suite against the installed module.

## 6.0.0

## 5.4.0

## 5.3.0

## 5.2.0

## 5.1.0
