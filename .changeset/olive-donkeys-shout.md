---
"@blazediff/core-native": minor
"@blazediff/core-wasm": minor
---

Speed up the diff kernel by 27-41%; fix an OOB read and x86 background rounding

- Pixels are rejected with integer math before the YIQ float pipeline, unchanged
  16px runs skip in one branch, and below-threshold chunks take a vectorized
  background write. NEON, wasm SIMD, AVX2 and SSE4.1.
- wasm no longer copies input buffers twice, and the byte-equality shortcut is
  compiled out there — without libc it lowered to a scalar memcmp slower than
  the whole SIMD diff (identical 4K pairs: 33.4ms → 16.3ms).
- **Bug:** the AA sibling check read one pixel past the buffer on the
  bottom-right interior pixel; segfaulted on 4K pairs with `-a -t 0`.
- **Bug:** `_mm{,256}_cvtps_epi32` rounds where the scalar path and NEON
  truncate, so x86 diff-image background pixels could differ by 1.

Diff counts and output images are otherwise unchanged — byte-identical across
312 native and 264 wasm configurations.
