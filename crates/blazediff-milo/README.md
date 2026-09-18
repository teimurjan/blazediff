# blazediff-milo

MILO, the learned perceptual image quality metric of Çoğalan, Bemana,
Myszkowski, Seidel and Groth (ACM TOG 2025), **as a std-only Rust crate: the
authors' trained network embedded, run through lane-generic SIMD kernels on
every core, and held to the PyTorch implementation's outputs by test.** No
PyTorch, no ONNX runtime, no download at first use.

## Why it exists

[BlazeDiff](https://github.com/teimurjan/blazediff) compares screenshots for
visual regression testing. Its structural-similarity metrics
(`blazediff-ssim`) already tolerate the noise a pixel diff trips over, but they
are formulas from 2004: they know about luminance, contrast and structure, and
nothing about *where the eye looks*. A one-unit shift across a busy texture and
the same shift across a flat panel score the same, though only one is visible.

MILO models that: visual masking, learned. A small convolutional network looks
at both images at four scales and predicts, per pixel, how visible an error
there would be. The absolute error is weighted by that mask and pooled. The
paper reports it ahead of LPIPS and DISTS on the standard FR-IQA benchmarks
with a fraction of their cost, and its authors published the weights under
Apache-2.0. This crate makes it a `cargo add` away.

## What it does

`milo` takes a reference and a distorted RGBA8 image of the same size and
returns:

- **`raw_error`**: the metric proper, `mean(mask * |reference - distorted|)`
  over pixels and channels. Exactly zero for identical images; the fixture
  pairs in this repo land between 0.0002 and 0.01. Threshold on this.
- **`mos`**: `raw_error` mapped onto KADID-10k's five-point mean-opinion-score
  scale through the learned calibration. Note it tops out around 4.35 rather
  than 5 for identical input; it is for reading, not for thresholding.
- **`mask`**: the visibility mask, one value per pixel.
- **`error_map`**: per-pixel perceived error in `0..1`, the reference's
  `MILO_map`. `render_map` paints it to grayscale.

Inputs must be at least 16px on each side, the smallest the reference accepts.
Alpha is ignored, as the reference converts to RGB.

## Usage

```rust
use blazediff_milo::{milo, MiloOptions, Rgba8};

let outcome = milo(
    Rgba8::new(&reference_rgba, width, height),
    Rgba8::new(&distorted_rgba, width, height),
    &MiloOptions::default(),
)?;
println!("raw error {:.6}, MOS {:.2}", outcome.raw_error, outcome.mos);
```

`MiloOptions { threads: Some(1) }` runs inline; the default uses every core.
The answer is bit-identical either way.

## How it runs

The network is 44,930 parameters (five 3x3 convolutions, 7-32-64-32-16-1, plus
a three-layer scaler), applied at four pyramid levels with the mask carried
up through bilinear upsampling. That is about 116k floating-point operations
per pixel of the finest level, three orders of magnitude more than SSIM, and
the reason this is not "just another metric" in `blazediff-ssim`.

Three things keep it practical on a CPU:

- **A line-buffer pipeline.** The reference materialises every layer over the
  whole image; layer two alone is half a gigabyte at 1080p. Here each stage
  keeps three rows and the five stages advance together, so memory is a few
  megabytes per thread whatever the image size.
- **Lane-generic SIMD.** One 3x3 kernel written against a four-op trait, with
  NEON, SSE2, AVX2+FMA (when the build enables them, as every shipped binary
  does) and wasm simd128 backends picked at compile time. Register-blocked
  over pixels and output channels, it reaches ~75% of the f32 FMA peak on an
  M1.
- **Row bands over threads.** Bands are independent, so they spread over
  `std::thread::scope` with no shared state; per-row partial sums are reduced
  in a fixed order, which is why the thread count never changes the answer.

Measured on an M1 Max: 1328x1228 in 2.5s on one core, 0.38s on all cores;
1320x2868 in 5.7s and 0.83s. Expect roughly 0.5s for a 1080p pair on a laptop.

## Accuracy

`tests/parity.rs` runs the crate against `tests/fixtures/reference.json`, the
outputs of the authors' `MILO_runner.py` on a CPU for seven fixture pairs from
this repo (every parity of width and height through three halvings) and four
small synthetic pairs whose full mask and error map are checked pixel by pixel.
Measured agreement: within 2e-6 relative on `raw_error`, 1.2e-6 absolute on
`mos`, 1.4e-5 on any mask value. The residual is summation order inside the
convolutions; PyTorch's is oneDNN's, and bit-exactness is not on offer.

`scripts/export-reference.py` regenerates both the weight blob and that JSON
from the upstream checkpoint, and records the checkpoint's hash.

## Bindings

The `napi` feature builds `@blazediff/milo-native`, the `python` feature the
`blazediff-milo` wheel, the `wasm` feature `@blazediff/milo-wasm`. All three
decode nothing themselves beyond what `blazediff-shared` provides for paths and
encoded buffers; the crate's own API is RGBA8 in, numbers out.

## License

MIT for the code. The embedded weights are the authors' MILO checkpoint,
Apache-2.0; see `licenses/MILO.md` in the repository.
