---
"@blazediff/rust-ssim": minor
---

Add `blazediff-ssim`: SSIM, MS-SSIM and Hitchhiker's SSIM as a standalone,
dependency-free, SIMD-first Rust crate.

It is a port of `@blazediff/ssim`, held to the reference MATLAB scripts through
Octave the same way the JS package is. SSIM lands within 0.03% of MATLAB across
the fixture set, and both ports agree to within 3e-7 of each other.

The crate stands on its own. `blazediff` is a pixel diff — it answers *where*
two images differ — and does not depend on this crate; the two share nothing but
the `blazediff-shared` primitives. Reach the metrics through `blazediff-ssim`
directly, or through `@blazediff/ssim-native` from JavaScript.
