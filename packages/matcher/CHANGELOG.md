# @blazediff/matcher

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
