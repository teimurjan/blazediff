# @blazediff/vitest

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
