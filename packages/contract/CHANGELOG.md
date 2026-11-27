# @blazediff/contract

## 1.0.1

### Patch Changes

- 816aa4d: Ship `.d.mts` declarations for the `import` condition, so ESM consumers on `moduleResolution: node16`/`nodenext` get ESM types instead of CommonJS ones. `import pixelmatch from "@blazediff/core/pixelmatch"` now typechecks there.
