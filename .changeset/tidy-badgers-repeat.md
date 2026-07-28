---
"@blazediff/core-native": minor
---

Fix alpha blending to match `@blazediff/core` and pixelmatch

The native engine blended semi-transparent pixels against white instead of the
procedural checkerboard in `FORMULA.md`, so the two engines disagreed on any
image with transparency (`fixtures/pixelmatch/5`: 256 diffs native vs 208 JS).

**Diff counts change for images with an alpha channel.** Fully opaque images are
unaffected, so most baselines will not move.

The AA detector now blends consistently too, and the SIMD kernels gate the blend
on an all-opaque check instead of running it unconditionally — up to 12% faster
on large page screenshots. A cross-engine parity suite covers every fixture.
