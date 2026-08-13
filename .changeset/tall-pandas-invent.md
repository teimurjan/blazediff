---
"@blazediff/ssim-native": minor
"@blazediff/interpret-native": minor
"@blazediff/cli": minor
"@blazediff/agent": minor
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

Region analysis becomes its own crate, **`blazediff-interpret`**, and a new
package, **`@blazediff/interpret-native`**. It sits *above* both producers and
consumes what they return: `interpret(image1, image2, source)` takes a
`ChangeSource::Diff` (what `blazediff::diff` returns), a `ChangeSource::Ssim`
(what any `blazediff-ssim` metric returns), or a `ChangeSource::Regions` (boxes
you already have). Neither producer depends on it — `blazediff` is a pixel diff
and `blazediff-ssim` is a metric library, and neither knows interpretation
exists.

Interpretation therefore leaves the packages that used to carry it:
`--interpret` is gone from the `blazediff` CLI, `interpret()` from
`@blazediff/core-native` and `@blazediff/core-wasm`, and the Python
`interpret_images`. `@blazediff/interpret-native` replaces all of them, and adds
what none of them had: a choice of how the regions are located.

A coarse source stays honest. Boxes from a score map are refined against the
source pixels before any statistic is computed, so shape, colour and gradient
analysis stay per-pixel: an 8x8 change described as a 16x16 box reports the same
64 changed pixels. The box itself stays as coarse as its source — the grid is
the map's — but `diff_count` means actually-changed pixels on every path, never
windows.

`interpret(a, b, out?, { source })` picks the locator: `pixel` (the default) for
exact boxes, or `ssim` / `ms-ssim` / `hitchhikers-ssim` when imperceptible noise
should not count. `interpretRegions(a, b, boxes)` skips the search when the
caller already knows where to look. Regions from a caller are validated, so a
box outside the image is an error rather than an out-of-bounds read.

`@blazediff/cli` gains an `interpret` command for it, and loses `--interpret`
from `core-native`:

```bash
blazediff-cli interpret expected.png actual.png
blazediff-cli interpret expected.png actual.png --source ms-ssim
blazediff-cli interpret expected.png actual.png --regions '[{"x":0,"y":0,"width":64,"height":64}]'
```

`@blazediff/agent` moves to the new package too, which drops it from two
comparison passes to one: `core-native`'s interpret never wrote the diff PNG, so
the agent ran a second non-interpret pass to produce it. The interpret binding
writes it in the same pass.
