# blazediff-ssim-benchmark

Comparison between BlazeDiff's structural-similarity metrics and
[dssim](https://github.com/kornelski/dssim), on two axes:

- **`blazediff-ssim-benchmark`** — what each metric costs, over the repo fixtures.
- **`blazediff-ssim-quality`** — how well each metric predicts human opinion,
  over a subjective-quality dataset. This is the one that can say "better",
  because it scores against people rather than against another metric.

## These are not the same metric

dssim is not "SSIM with a different scale and sign". It is a *perceptual*
metric that deliberately departs from textbook SSIM to model the human visual
system; BlazeDiff's family is a reference SSIM implementation, validated
against the MATLAB scripts in `packages/ssim/matlab`. They answer different
questions, and the differences are algorithmic:

| dssim does | BlazeDiff does |
| --- | --- |
| Multiple weighted scales (after IWSSIM), because single-scale SSIM is biased toward differences smaller than its Gaussian kernel | Only `ms-ssim` is multi-scale. `ssim` is single-scale and carries exactly that bias; `hitchhikers-ssim` is single-scale with a box window |
| Downscales in **linear-light RGB**, so viewing distance and lens blur are modelled physically | Downscales gamma-encoded sRGB luma — faithful to MATLAB's `ssim.m`, but the gamma is wrong for a physical model, and it masks chroma-subsampling artifacts |
| Compares Lab **a/b** channels at reduced spatial precision, matching the eye's lower chroma acuity | Reduces to luma and discards chroma entirely |
| Pools with **mean absolute deviation** | `ssim`/`ms-ssim` pool with the mean; `hitchhikers-ssim` pools with `1 − CoV` |

So dssim should be expected to catch things these metrics cannot, and to weight
what it does catch differently. This crate measures **what each library costs**
and **where the two actually diverge** — it does not claim they are
interchangeable, and their absolute numbers are not comparable (dssim reports
dissimilarity, `0.0` = identical; BlazeDiff reports similarity, `1.0` =
identical).

## Running the speed benchmark

```sh
cargo run --release -p blazediff-ssim-benchmark --features dssim              # repo fixtures/
cargo run --release -p blazediff-ssim-benchmark --features dssim -- path/     # custom corpus
cargo run --release -p blazediff-ssim-benchmark --features dssim -- --max-mpx 60
cargo run --release -p blazediff-ssim-benchmark --features dssim-threads
cargo run --release -p blazediff-ssim-benchmark --features dssim -- --only ms-ssim,dssim
```

`--only` keeps a comma-separated subset of the metrics by name, for iterating on
one of them without paying for the whole table.

The corpus is every `<stem>a.png` with a `<stem>b.png` beside it, recursively.
`--max-mpx` caps image size (default 30); dssim holds three `f32` Lab planes per
image per scale and BlazeDiff's Hitchhiker's variant holds five `f64`
summed-area tables, so the 59 MPx `page/` fixtures want multiple gigabytes from
both. Skipped pairs are listed rather than silently dropped.

**dssim is built single-threaded by default here** (`default-features = false`
drops its `threads` feature), so the timing reflects the algorithms rather than
the thread counts. `--features dssim-threads` measures dssim as a plain
`cargo add` would give it to you; the header line says which build ran.

**The `dssim` feature is opt-in because `dssim-core` is AGPL-3.0 and this repo
is MIT.** The dependency is optional and the binary declares
`required-features = ["dssim"]`, so `cargo build --workspace` never links it and
nothing built from this crate is ever distributed. See
[licenses/DSSIM.md](../../licenses/DSSIM.md).

## Cost

16 pairs, 70.7 MPx, Apple Silicon (M-series). Two pairs over the size cap.

| Metric | Total | MPx/s | vs dssim |
| --- | --- | --- | --- |
| **ssim** | **443 ms** | **160** | 13.0× faster |
| **hitchhikers-ssim** | **497 ms** | **142** | 11.6× faster |
| **ms-ssim** | **1005 ms** | **70** | 5.7× faster |
| dssim | 5750 ms | 12 | 1.00× |

With dssim's `threads` feature on it drops to 2575 ms — about 2.2× — so the
margins become 5.8× / 5.2× / 2.6×.

Read this as *what each library costs*, not as a like-for-like race: dssim is
doing strictly more work per pixel (three channels through a linear-light
pyramid, not one gamma-encoded plane). `ms-ssim` is the closest structural
counterpart — the only BlazeDiff metric that also pools five scales at full
input resolution — and it is the one with the smallest margin.

`ms-ssim` (and the perceptual variant below, which shares its pyramid) runs
through the streaming kernel in `blazediff_ssim::stats`: one pass per level
that keeps the five convolutions' accumulators in registers and their filtered
rows in cache, instead of pushing eleven full-size intermediates per level
through DRAM. It is bit-identical to the unfused form — pinned by
`streaming_matches_the_unfused_pipeline_bit_for_bit` — so the scores below are
the same floats either way.

## Where they agree, and where they don't

Over the fixture corpus the metrics order pairs by damage similarly:

| Metric | Spearman ρ with dssim |
| --- | --- |
| ms-ssim | 0.951 |
| hitchhikers-ssim | 0.945 |
| ssim | 0.827 |

This says the metrics **tend to rank the same corpus the same way**, which is
useful for a regression gate that only needs "is this worse than that". It does
**not** say they measure the same thing — a rank correlation cannot see a
distortion that one metric scores as zero, and there are two such classes here:

**Chroma.** A checkerboard of `rgb(200,30,60)` and `rgb(111,39,247)`, versus the
same checkerboard with the two colours swapped. The colours have byte-identical
luma (84.2398 apiece), so BlazeDiff's luma planes are constant in both images:
all three metrics score `1.0` — identical. dssim scores **0.4469**, more than
twice the worst score anywhere in the real fixture corpus (`0.185`). Pinned by
`the_blazediff_metrics_are_blind_to_a_pure_chroma_change`.

**Alpha.** `alpha/1a.png` vs `alpha/1b.png` differ in nothing but the alpha
channel (5348 pixels; RGB byte-identical). BlazeDiff scores `1.000000`, dssim
`0.002491`, because it premultiplies alpha before converting to Lab.

If your regression suite cares about colour-only or transparency-only changes,
these metrics will not catch them — the `pixel` metric will.

`hitchhikers-ssim` tracking dssim this closely here turns out to say very
little: on the MOS data below it is the *worst* predictor of human opinion of
the four. Agreeing with another metric on 16 pairs is not evidence of quality —
which is exactly why the quality harness exists.

Numbers move with hardware and corpus; rerun the command above to reproduce on
your machine.

## Running the quality harness

```sh
./scripts/fetch-kadid10k.sh                  # ~3 GB, gitignored, one time
BLAZEDIFF_MOS_DATASET=.datasets/kadid10k \
  cargo run --release -p blazediff-ssim-benchmark --features dssim \
    --bin blazediff-ssim-quality
```

`--limit N` scores a prefix for a quick smoke test. Full run is ~52 s on 10
cores.

This is the only measurement here that can say "better". It scores every metric
against [KADID-10k](../../licenses/KADID-10K.md) — 10125 distorted images, each
with a mean opinion score from real viewers — and reports SRCC/KRCC (fit-free
rank correlation) plus PLCC/RMSE after the standard five-parameter logistic
mapping.

## Quality: dssim wins

10125 samples, 25 distortion types. Higher is better except RMSE.

| Metric | SRCC | KRCC | PLCC | RMSE |
| --- | --- | --- | --- | --- |
| **dssim** | **0.8561** | **0.6679** | **0.8531** | **0.5648** |
| ms-ssim | 0.8186 | 0.6270 | 0.8163 | 0.6254 |
| ssim | 0.7499 | 0.5595 | 0.7466 | 0.7203 |
| hitchhikers-ssim | 0.7099 | 0.5219 | 0.7135 | 0.7586 |

dssim predicts human opinion better than every BlazeDiff metric, on every
figure, and wins 17 of the 25 distortion types outright. Its extra work buys
something real. If what you need is a metric that agrees with people, dssim is
the better metric today and the 6-13× speed advantage above does not change
that.

Two things the per-type breakdown says about *why*, both of which contradict a
guess that looked obvious beforehand:

**Multi-scale is the biggest single lever, not colour.** Going single-scale →
multi-scale inside BlazeDiff (`ssim` 0.7499 → `ms-ssim` 0.8186) is worth
**0.069 SRCC**. dssim's entire remaining lead over `ms-ssim` is 0.037 — smaller
than the gain we already get from pyramid pooling alone.

**Chroma explains less of the gap than the synthetic case suggests.** The
harness measures, per distortion type, what share of the pixel change is
carried by Cb/Cr rather than luma, and correlates that with dssim's lead. The
result is **ρ = 0.31** — weakly positive, not decisive. Colour-heavy types are
not reliably the ones we lose: type 04 has the highest chroma share (0.699) and
we trail by only 0.020, while type 13 is 0.498 chroma and we *beat* dssim by
0.065. The equal-luma checkerboard above shows the blind spot is total in the
limit; on real distortions it is one contributor among several.

**`hitchhikers-ssim` is the weakest predictor of human opinion** (0.7099),
despite tracking dssim's ranking on the fixture corpus about as closely as
`ms-ssim` did (ρ 0.945 vs 0.951). Agreement with another metric is not
agreement with people — that earlier hypothesis about its CoV pooling does not
survive contact with the MOS data.

Numbers move with the dataset; nothing from it is committed.

## Phase 2: closing the gap

`blazediff_ssim::perceptual_ssim` is an MS-SSIM variant with each of dssim's
departures turned into a switch, so the harness can attribute the gap instead of
anyone guessing. With every switch off it is **bit-identical to `ms-ssim`**
(pinned by `reduces_to_ms_ssim_with_every_knob_off`), which is what makes the
deltas below attributable.

```sh
BLAZEDIFF_MOS_DATASET=.datasets/kadid10k \
  cargo run --release -p blazediff-ssim-benchmark --features dssim \
    --bin blazediff-ssim-quality -- --ablate
cargo run --release -p blazediff-ssim-benchmark --features dssim -- --ablate  # same set, timed
```

### What each departure is worth

Against the `ms-ssim` baseline of 0.8186 SRCC:

| Configuration | SRCC | Δ vs ms-ssim |
| --- | --- | --- |
| **+lab+chroma.25/sub1+mad** | **0.8631** | **+0.0445** |
| dssim | 0.8561 | +0.0375 |
| +lab+chroma.25/sub1 | 0.8492 | +0.0306 |
| +lab+chroma.25+mad | 0.8426 | +0.0240 |
| +mad | 0.8374 | +0.0188 |
| +lab+chroma.10 | 0.8302 | +0.0116 |
| +lab+chroma.25 | 0.8211 | +0.0025 |
| ms-ssim / perceptual base | 0.8186 | — |
| +lab+chroma.50 | 0.7932 | -0.0254 |
| +lab | 0.7897 | -0.0289 |

Three things worth reading off it:

**Linear-light Lab on its own makes things worse** (-0.029). It is not a free
upgrade — it only pays once chroma rides along with it, which is presumably why
dssim treats the two as one design rather than two features.

**Chroma has to be spatially coarse to help.** At full resolution a 0.25 chroma
weight is worth +0.003; the same weight one octave down is worth +0.031. Weight
it too heavily (0.50) and it goes negative. This is the eye's lower chroma
acuity showing up as a measurement.

**Pooling is the cheapest win.** Mean-absolute-deviation pooling alone is worth
+0.019 for no colour-science machinery at all, and it stacks with the rest.

### Does it beat dssim?

On this dataset, yes — on every figure, and on both held-out folds:

| Metric | SRCC | KRCC | PLCC | RMSE | fold A | fold B |
| --- | --- | --- | --- | --- | --- | --- |
| **+lab+chroma.25/sub1+mad** | **0.8631** | **0.6747** | **0.8625** | **0.5477** | **0.8688** | **0.8577** |
| dssim | 0.8561 | 0.6679 | 0.8531 | 0.5648 | 0.8640 | 0.8488 |

And it is cheaper, on the same fixture corpus as the speed table above:
**3076 ms vs dssim's 5701 ms, 1.85x faster**. Most of the 5.7x that `ms-ssim`
enjoys is still gone — three channels through a linear-light pyramid is most of
what dssim was paying for in the first place, and this variant pays it too.

Getting from 1.10x to 1.85x took three changes, none of which move a score. The
pyramid is bit-identical throughout and the KADID-10k table above is
byte-for-byte what it was before the work:

- **The statistics stream.** `blazediff_ssim::stats` runs one pass per level
  instead of five separable convolutions over eleven full-size intermediates,
  and holds the tap accumulators in registers rather than re-reading them once
  per tap. This is the shared win — `ms-ssim` gets it too.
- **The cube root is inlined.** Three `cbrtf` calls per pixel per side per level
  is the hottest single operation in a L\*a\*b\* pyramid, and a `libm` call
  cannot vectorise. `blazediff_ssim::color::cube_root` is Newton on
  `z = x^(-1/3)` — two steps in `f32`, two in `f64` — which lets the whole
  conversion through the vector unit.
  `the_cube_root_matches_libm_over_the_whole_lab_domain` checks it against
  `f32::cbrt` on every one of the 67M floats the conversion can hand it, so this
  is exact rather than close.
- **The buffers are allocated once.** Five scales times three channels was
  fifteen sets of full-size intermediates per comparison, and faulting those in
  cost more than the arithmetic they carried.

The one number that moved is the pooling sum under `+mad`, which now runs four
`f64` accumulators instead of one. That reassociation lands about `1e-13` from
the strictly sequential order — and nearer the exact total, not further — which
is why every published figure above is unchanged.

### What this does not yet establish

- **The configuration was chosen by looking at KADID-10k.** The fold split shows
  each setting is stable across disjoint reference images, which rules out one
  kind of luck, but the *selection* still saw both folds. A defensible "better
  than dssim" needs the winning configuration re-run untouched on a second
  database — TID2013 or CSIQ — and that has not been done.
- **The margin is 0.0070 SRCC.** Small enough that a different dataset could
  reverse it.
- **The speed win is against single-threaded dssim.** With its own `threads`
  feature dssim scores the same corpus in 2575 ms against this variant's
  3076 ms, so it still wins on wall clock — by 1.2x now rather than 2x, and by
  spending ten cores to blazediff's one.
- **Nothing is shipped.** `perceptual_ssim` is a library function; no `Metric`
  variant exposes it, and no default changed.
