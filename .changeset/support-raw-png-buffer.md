---
"@blazediff/matcher": minor
---

Support raw PNG Buffer input in toMatchImageSnapshot()

- Add support for passing raw PNG Buffers directly (like `canvas.toBuffer('png')`)
- Raw PNG buffers are automatically decoded to extract dimensions
- New `isRawPngBuffer()` type guard exported for detecting raw PNG input
- Fix: `updateSnapshots: 'all'` now only updates when images actually differ (skips identical snapshots)
