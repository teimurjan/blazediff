# @blazediff/matcher

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
