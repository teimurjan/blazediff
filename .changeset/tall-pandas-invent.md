---
"@blazediff/ssim-native": minor
"@blazediff/core-native": minor
"@blazediff/core-wasm": minor
"@blazediff/rust": minor
"@blazediff/rust-shared": minor
"@blazediff/rust-interpret": minor
"@blazediff/rust-png": minor
"@blazediff/rust-ssim": minor
---

Add `@blazediff/ssim-native`, a standalone N-API package for the SSIM family.

`@blazediff/core-native` is a pixel diff: it answers *where* two images differ.
This package answers *how alike* they look, and exposes the whole crate to do
it — every stability constant (`k1`, `k2`, `bitDepth`), MS-SSIM `weights` and
pooling `method`, Hitchhiker's `windowStride` and `covPooling`, the whole of
`perceptual-ssim`, and the local score map itself, either returned as a
`Float32Array` or rendered to a path. It takes file paths or encoded
PNG/JPEG/QOI buffers like `compare` does, plus raw-RGBA entry points (`ssim`,
`msSsim`, `hitchhikersSsim`, `perceptualSsim`) that skip decoding.

The two packages are independent and share no code but the decoders; installing
one does not pull in the other, and `blazediff` no longer depends on
`blazediff-ssim`.

The shared primitives move to a new crate, **`blazediff-shared`**: `Image`, the
`yiq` color math, the vendored libspng and libjpeg-turbo, and the format
dispatch. The crates above it form a chain — `blazediff` depends on
`blazediff-ssim` — so anything two of them share has to live below both. Its
`codecs` feature is on by default and off for wasm, where only `Image`,
`ImageError`, `ImageFormat` and `yiq` are needed. `blazediff`'s public API is
unchanged — `Image`, `load_png`, `save_jpeg`, `DiffError` and `yiq::*` keep
their paths and signatures, and its `io` feature keeps gating the same things.

The extraction also collapses three copies of the `ImageFormat` /
`load_images` / `save_image` dispatch — one each in the CLI, the N-API binding
and the Python extension — into one. As a side effect, an unsupported format now
reports `Unsupported format: a.webp` rather than doubling the prefix.

Region analysis becomes its own crate, **`blazediff-interpret`**, and gains a
regions-in entry point. It used to be reachable only by running a pixel diff;
now any producer can supply the regions and get the same classification.
`blazediff` still finds them by connected components over a diff mask,
`blazediff-ssim` can find them by thresholding a score map
(`regions_from_score_map`), and a caller can simply pass their own — DOM
rectangles, a crop list, anything.

The boxes may be coarse. Each one is refined against the source pixels before
any statistic is computed, so shape, colour and gradient analysis stay
per-pixel: an 8x8 change described as a 16x16 box reports the same 64 changed
pixels. `diff_count` therefore means actually-changed pixels on every path,
never windows.

Two new JS entry points follow from it: `interpretRegions` in
`@blazediff/core-wasm` takes regions straight from JS, and `interpret` in
`@blazediff/ssim-native` locates them with the score map first. Regions from a
caller are validated, so a box outside the image is an error rather than an
out-of-bounds read.

`blazediff::interpret::*` is unchanged — the new crate is re-exported from it,
and `interpret` / `interpret_with_output` keep their signatures.
