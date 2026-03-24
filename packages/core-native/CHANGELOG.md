# @blazediff/core-native

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
