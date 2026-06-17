# blazediff-png

A from-scratch PNG codec in Rust: **single-threaded, SIMD-first, and byte-exact
decode-compatible with [libspng](https://libspng.org)** — faster than spng on
every fixture we test, for both decode and encode.

## Why it exists

[BlazeDiff](https://github.com/teimurjan/blazediff) compares screenshots for
visual regression testing. Profiling showed the bottleneck wasn't the pixel diff —
it was PNG I/O: decoding the two inputs and writing the result back. BlazeDiff
already used [spng](https://libspng.org) (the fastest option found) through FFI;
this crate replaces it on its own terms: **decode the same bytes spng decodes,
reject the same inputs spng rejects, and do it faster** — then do the same for
encode. It's tuned to be fast on *one* image on *one* core, leaving the caller to
parallelize across images.

## What it does

- **Decode** — every format spng accepts (bit depths 1/2/4/8/16, all five color
  types, palette + tRNS, gray/RGB color-key transparency, Adam7 interlacing) to
  RGBA8, producing the *same bytes* spng produces. `decode_with` targets any
  `SPNG_FMT_*` with optional gamma/sBIT transforms; `decode_with_metadata`
  captures every ancillary chunk.
- **Encode** — all color-type / bit-depth combinations, optional Adam7, real
  deflate levels (libdeflate) plus a stored level 0. Lossless by construction:
  the chosen mode must represent the input exactly, so `decode(encode(x)) == x`
  always holds.

## Performance

Versus spng over the BlazeDiff corpus (34 PNGs, 342.7 MPx, up to 5600×3200),
single-threaded on Apple Silicon — faster on every fixture:

| Operation | vs spng | Notes |
| --- | --- | --- |
| Decode | **~1.4×** | whole-buffer libdeflate inflate + SIMD defilter |
| Encode, stored (level 0) | **~2.2×** | uncompressed deflate blocks, copy/alloc-light pipeline |
| Encode, compressed | **~3.8×** | libdeflate level 6 vs spng zlib 4, at ~94% of spng's file size |

The wins come from doing less, not from threads: whole-buffer inflate instead of
spng's per-scanline gating, in-place sequential defiltering, autovectorizable row
expansion, and hand-written NEON kernels for the encode filter hot path. The
BlazeDiff diff-write case (RGBA8, no filter, level 0) takes a dedicated route that
streams the PNG straight from the borrowed pixel rows — no intermediate raw or
zlib buffer.

Full per-fixture numbers: [`blazediff-png-benchmark`](../blazediff-png-benchmark).
For how the codec works internally, see [`HOW_IT_WORKS.md`](./HOW_IT_WORKS.md).

## Usage

```rust
let bytes = std::fs::read("image.png")?;

// Decode to RGBA8: Image { data, width, height }.
let image = blazediff_png::decode(&bytes)?;

// Re-encode (Auto picks the smallest lossless color mode; level 4 by default).
let png = blazediff_png::encode(&image, &blazediff_png::EncodeOptions::default())?;
```

`ImageRef` + `encode_ref` / `encode_to` encode from a borrowed buffer or stream
straight into a `Write` sink without owning an `Image`.

## Parity by identity

The hard part of matching spng isn't well-formed images — it's malformed ones.
zlib's *acceptance* of broken deflate streams isn't portable: classic zlib (what
spng links) tolerates a "distance too far back" at scanline boundaries and copies
from window memory; zlib-ng/zlib-rs reject those streams; libdeflate insists on
complete, adler-valid streams; miniz validates ahead of the write gate. Classic
zlib's verdict can even depend on the exact output-buffer gating sequence.

So spng's edge-case behavior can't be reproduced by reimplementation. For those
cases the decoder **links the same system zlib spng links** and drives it with
spng's exact per-scanline gate sequence — parity by identity. libdeflate stays the
whole-buffer fast path for well-formed streams. (Verified on system-zlib
platforms; on Windows spng bundles miniz, so boundary semantics differ there.)

Byte-identical *encode* output is **not** a goal — both emit valid-but-different
streams. The encode contract is lossless round-tripping plus spng cross-decode
compatibility.

## Deflate backends

The inflate/compress seam is pluggable; everything else is pure Rust.

| Feature | Backend | Use |
| --- | --- | --- |
| `zlib-backend` (default) | system zlib + libdeflate (C) | byte-exact spng parity, incl. accept/reject on malformed streams |
| `rust-backend` | `zune-inflate` + `fdeflate` (pure Rust) | C-free native builds |

`rust-backend` is correct for every well-formed PNG but **not** bug-compatible
with spng on malformed/adversarial streams.

## Verified

| Layer | Result |
| --- | --- |
| Exhaustive matrix | every {depth × color × interlace × filter × tRNS} at edge sizes, byte-parity with spng |
| PngSuite conformance | 176/176 — 164 decode at parity, 12 corrupt files reject in lockstep |
| Differential fuzzing | 40M+ execs vs spng, **0 unresolved divergences** |
| Encode round-trip fuzzing | 5M+ execs, round-trip + spng cross-decode clean |
| Line coverage | **98.89%** (residual lines are unreachable defensive arms) |

## Status

Experimental. Inside BlazeDiff it's opt-in behind the `BLAZEDIFF_PNG_ENABLED`
environment variable while it stabilizes; spng stays the default and the defensive
decode fallback.

## License

MIT
