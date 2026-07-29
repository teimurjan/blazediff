---
"@blazediff/core-native": minor
"@blazediff/core-wasm": minor
---

Fix alpha blending to match `@blazediff/core`; 27-41% faster diff kernel

**Diff counts change for images with an alpha channel.** Semi-transparent pixels
were blended against white instead of the `FORMULA.md` checkerboard
(`fixtures/pixelmatch/5`: 256 native vs 208 JS). Opaque images are unaffected, so
most baselines will not move. A cross-engine parity suite now covers every fixture.

Kernel: integer rejection before the YIQ float pipeline, one-branch skips over
unchanged 16px runs, vectorized background writes, and no double buffer copy on
wasm. Also fixes an out-of-bounds read in the AA sibling check that segfaulted on
4K pairs with `-a -t 0`, and x86 background pixels rounding where scalar and NEON
truncate.
