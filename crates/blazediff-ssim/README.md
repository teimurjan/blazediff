# blazediff-ssim

Structural-similarity metrics in Rust: **SSIM, MS-SSIM and Hitchhiker's SSIM,
vectorised through one lane-generic SIMD layer and held to the reference MATLAB
scripts through Octave.** No dependencies, no threads, no runtime dispatch.

## Why it exists

[BlazeDiff](https://github.com/teimurjan/blazediff) compares screenshots for
visual regression testing. A per-pixel diff answers "which pixels changed",
which is the right question until anti-aliasing, font hinting or a codec's
rounding moves a few thousand pixels by one unit and the run goes red for no
reason a human would call a change.

SSIM answers the other question: how alike do these look. The catch is that
"SSIM" names a family whose members disagree by more than their published
formulas suggest, because the reference implementations differ in window
placement, boundary handling and downsampling. So the contract here is not "we
implemented the paper", it is **land where MATLAB lands, to a stated tolerance,
and keep landing there**.

The metrics turned out to have no dependency on the diff engine at all, so they
live in their own crate. `blazediff` consumes it; so can you.

## What it does

- **`ssim`**: Gaussian-windowed single-scale SSIM in `'valid'` mode, with the
  automatic downsampling to ~256px on the short edge that MATLAB's `ssim.m`
  does. That downsample is why it is also the fastest of the three on large
  inputs.
- **`ms_ssim`**: SSIM pooled across a 5-octave dyadic pyramid, per `msssim.m`.
  Product or weighted-sum pooling. Needs at least 176px on the short edge for
  the default five scales.
- **`hitchhikers_ssim`**: box windows over five integral images, pooled by
  coefficient of variation (Venkataramanan et al. 2021). Every window sum is an
  O(1) summed-area-table lookup instead of ten 11-tap convolutions.
- **`perceptual_ssim`**: the tunable variant. CIE L\*a\*b\*, chroma weighting,
  chroma subsampling and mean-absolute-deviation pooling, each an independent
  knob. With `PerceptualOptions::default()` it reduces *bit-identically* to
  `ms_ssim`, which is what makes it usable as an ablation study rather than a
  second opinion.

Every metric returns a pooled score and the local map it was pooled from;
`render_map` paints that map into an RGBA8 buffer as grayscale.

## Usage

```rust
use blazediff_ssim::{ms_ssim, MsSsimOptions, Plane, Rgba8, SsimOptions};

let plane1 = Plane::from_rgba8(Rgba8::new(&rgba1, width, height))?;
let plane2 = Plane::from_rgba8(Rgba8::new(&rgba2, width, height))?;

let outcome = ms_ssim(
    &plane1,
    &plane2,
    &SsimOptions::default(),
    &MsSsimOptions::default(),
)?;
println!("{:.6}", outcome.score); // 1.0 means identical
```

`Rgba8` is a borrowed view, so nothing is copied to call in. Decoding is the
caller's problem: the crate takes RGBA8 bytes and has no I/O.

### Python - `blazediff-ssim`

```bash
pip install blazediff-ssim
```

PyO3 bindings shipped as `abi3-py38` wheels for CPython ≥ 3.8 (macOS, Linux
manylinux, Windows; arm64 + x86_64). Built from this crate's `python` Cargo
feature, which pulls in PNG/JPEG/QOI decoding so paths and encoded bytes work
directly.

```python
import blazediff_ssim as ssim

result = ssim.compare("expected.png", "actual.png", metric="ms-ssim")
print(result.score)  # 1.0 means identical

# Also: compare_buffers(bytes, bytes), compare_rgba(bytes, bytes, w, h),
# render_map(map, map_w, map_h, w, h) and metrics().
```

Every knob the Rust API exposes is a keyword argument: `min_score`,
`window_size`, `k1`, `k2`, `bit_depth`, `weights`, `method`, `window_stride`,
`cov_pooling`, `color`, `chroma_weight`, `chroma_subsample`, `pooling` and
`deviation_weight`. Pass `return_map=True` to get the local scores back as
little-endian `float32` bytes — `numpy.frombuffer(result.map, dtype="<f4")`.

## Performance

Wall-clock on a 4K pair, decode included (decode is ~200 ms of each):

| Metric | 4K pair | Why |
| --- | --- | --- |
| `ssim` | 320 ms | MATLAB's automatic downsample shrinks the plane to ~256px before any convolution runs |
| `hitchhikers-ssim` | 380 ms | full resolution, but O(1) window sums |
| `ms-ssim` | 480 ms | full resolution at the finest of five scales |

Against single-threaded [dssim](https://github.com/kornelski/dssim), `ms_ssim`
runs about **1.9×** faster. Two things bought that, neither of them threads:

**One fused statistics pass.** A scale needs five moments (µ1, µ2, σ1², σ2²,
σ12), which the textbook pipeline computes as eleven full-size intermediates.
`stats.rs` streams them through a row ring buffer in a single pass instead.
It is bit-identical to the unfused path by construction, and
`streaming_matches_the_unfused_pipeline_bit_for_bit` is the test that keeps it
that way.

**Compile-time lane selection.** Five kernel shapes carry nearly all the time,
so each is written once against a `SimdF32` trait and instantiated per ISA:
NEON on aarch64, SSE2 on x86_64, simd128 on wasm32, a scalar fallback
elsewhere. All are baseline for their target, so nothing dispatches inside a
hot loop and there is no runtime feature detection.

## Bit-exactness is the constraint, not an outcome

Tap-by-tap accumulation order is frozen to the `@blazediff/ssim` TypeScript
port. That is a deliberate handcuff: the JS port is the one whose MATLAB
agreement was measured, so matching its order means this crate *inherits* that
agreement instead of drifting away from it by an unmeasured amount. Anything
that would reassociate the sums, including some obvious-looking vectorisations,
is out of bounds even when it is faster.

Two consequences worth knowing about:

- `cube_root` replaces `cbrtf` in the Lab conversion, and is checked against
  libm across the whole L\*a\*b\* domain rather than assumed equivalent.
- FMA is used inside the vector body and deliberately *not* in the scalar tail,
  because the reference does not fuse either. Un-fusing the tail is a
  correctness fix, not a pessimisation.

`MsSsimMethod::Product` returns `NaN` when a scale's mean contrast-structure
term goes negative. That takes globally anticorrelated content (an inverted
image) rather than ordinary degradation, and both references degenerate the same
way: the JS gives `NaN`, MATLAB gives a complex number. The behaviour is kept
rather than papered over. `WeightedSum` stays finite throughout.

## Verified

| Layer | Result |
| --- | --- |
| MATLAB `ssim.m` | within **0.01%** on three fixture pairs, **0.05%** on the one where downsampling by 5 costs the most precision |
| MATLAB `msssim.m` | within **0.05** absolute. The references pool `'valid'` statistics where both ports pool symmetric `'same'`, so the gap is algorithmic, not numerical |
| TypeScript port | all three metrics agree to within **5e-6**, the only cross-port pin for `hitchhikers-ssim`, which has no MATLAB reference |
| Fused statistics | bit-identical to the unfused eleven-buffer pipeline |
| `cube_root` | exhaustive over ~67M f32 values across the Lab domain (`--release --ignored`) |
| Unit + integration tests | 55 + 4 |

The MATLAB half shells out to Octave. Install it (`brew install octave`) and:

```sh
BLAZEDIFF_REQUIRE_OCTAVE=1 cargo test -p blazediff-ssim --test matlab_parity
```

Without Octave those tests report a skip and pass, so the default `cargo test`
needs no toolchain beyond Rust. `BLAZEDIFF_REQUIRE_OCTAVE=1` turns a missing
Octave into a failure, which is what CI should set so parity cannot pass
vacuously.

## Caveats

All three shipped metrics reduce to luma, so a change carried entirely by chroma
or by alpha is invisible to them. `perceptual_ssim` with `ColorSpace::Lab` and a
non-zero `chroma_weight` sees colour;
[`blazediff-ssim-benchmark`](https://github.com/teimurjan/blazediff/tree/main/crates/blazediff-ssim-benchmark)
measures what each knob is worth against dssim on KADID-10k.

Scores are pooled over a local map, so these metrics say *how much* two images
differ, not *where* beyond the resolution of that map. For exact locations, use
a pixel diff.

## License

MIT. The algorithms are published research; attributions are in
[`licenses/`](https://github.com/teimurjan/blazediff/tree/main/licenses).
