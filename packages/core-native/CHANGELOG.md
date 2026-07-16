# @blazediff/core-native

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
