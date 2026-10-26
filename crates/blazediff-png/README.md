# blazediff-png

A from-scratch PNG codec in Rust: **single-threaded, SIMD-first, and byte-exact
decode-compatible with [libspng](https://libspng.org)** — faster than spng on
every fixture we test, for both decode and encode. It differs from spng in one
place, where spng breaks the PNG spec (see
[Where blazediff-png differs from spng](#where-blazediff-png-differs-from-spng)).

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

## Parallel encode

The `parallel` feature adds `encode_parallel(&image, &options, threads)`. It
cuts the filtered stream into 256 KiB bands and compresses them on up to
`threads` workers. Each band starts with the previous 32 KiB as its dictionary,
so the bands lose almost nothing in compression. Every band except the last
ends on a sync flush, and the bands join into one standard zlib stream.

The output depends only on the image and the options. Any thread count gives
the same bytes. The bands use zlib-rs, because libdeflate cannot end a band on
a non-final block. So the bytes differ from `encode`, but the pixels are the
same. Level 0 gives exactly the `encode` output. Levels 10 to 12 map to 9.

Measured on an Apple M1 Max with 8 threads (`benchmarks/parallel_encode.rs`):

| Fixture | Level | `encode` | `encode_parallel` | Size vs `encode` |
| --- | --- | --- | --- | --- |
| 4K photo, 5600x3200 | 4 | 574 ms | 144 ms (4.0x) | -0.6% |
| 4K photo | 6 | 885 ms | 234 ms (3.8x) | -0.2% |
| page screenshot, 3598x16384 | 4 | 486 ms | 205 ms (2.4x) | +2.2% |
| page screenshot | 6 | 749 ms | 215 ms (3.5x) | +3.5% |

The size difference comes from zlib-rs against libdeflate, not from the bands:
a single band gives the same sizes. The screenshot stops scaling at about
200 ms. The probable limit is the work that still runs on one thread before
compression: color-mode detection, filtering and stream assembly. This is not
profiled yet. With one thread, `encode_parallel` is slower than `encode` on
photos (658 ms against 574 ms at level 4). Use `encode` unless you have spare
cores.

## Parity contract

The test suite holds every backend to three rules:

| Rule | Input | Backends | Requirement |
| --- | --- | --- | --- |
| A | valid PNG | all | same pixels as spng (RGBA8 and every `SPNG_FMT_*`) and as image-rs `png` (RGBA8), except where spng breaks the spec (below) |
| B | malformed chunks (signature, IHDR, CRC, ancillary, limits, IDAT layout) | all | same accept/reject and pixels as spng |
| C | malformed deflate stream | `zlib-backend` | same accept/reject and pixels as spng |
| C | malformed deflate stream | `rust-backend` | no panic; when both decoders accept, same pixels |

`tests/spec.rs` adds checks with no decoder oracle: filter, Adam7, sample
scaling and tRNS rules, with expected values taken from the PNG spec.

## Where blazediff-png differs from spng

Gray tRNS key. A gray tRNS key is the one gray value that decodes as
transparent. PNG 3rd edition (11.3.1.1) says that decoders must mask the key to
the image bit depth before they compare it. spng compares the full 16-bit
value, so a key with bits set above the bit depth never matches, and those
pixels stay opaque. blazediff-png masks the key, as image-rs does, so those
pixels are transparent. Only files from encoders that do not zero the unused
bits are affected. With `BLAZEDIFF_PNG_ENABLED` set, these files decode
differently from the spng path. The `gray_trns_key_is_masked_to_bit_depth`
test pins this.

Adler-32 trailer. The Adler-32 trailer is the checksum at the end of the zlib
stream. Neither decoder reads it. Both stop inflating at the last scanline
byte, so a wrong or missing trailer is not an error. spng behaves this way even
with Adler-32 checks enabled. blazediff-png keeps this behavior because a check
makes every decode read past the image data, and it rejects files that spng
accepts. The `wrong_adler_trailer_is_never_read` test pins this.

`rust-backend` on malformed deflate streams. `rust-backend` inflates with
`zune-inflate`, not the zlib that spng links. On some malformed streams it
rejects a file that spng accepts, for example a stream with no final-block bit
or with invalid data after the last needed byte. Every valid PNG decodes the
same on both backends (Rule A). This matters for the wasm build, which can use
only `rust-backend`: a browser can reject a damaged file that the native build
accepts. Rule C records what the suite allows.

Run the suite on each backend:

```sh
cargo test -p blazediff-png --release
cargo test -p blazediff-png --release --no-default-features --features rust-backend
```

Use `-p blazediff-png`. A workspace-wide `cargo test` unifies features across
members, so it turns `zlib-backend` back on.

## Verified

| Layer | Result |
| --- | --- |
| Exhaustive matrix | every {depth × color × interlace × filter × tRNS} at edge sizes, byte-parity with spng (except spec-masked gray tRNS keys) |
| PngSuite conformance | 176/176 — 164 decode at parity, 12 corrupt files reject in lockstep |
| Real-image corpus | Urban100 · BSD100 · Set14 · Set5 + PngSuite (~395 files) decode byte-identically to spng at RGBA8 and every `SPNG_FMT_*`; every accepted image encode-round-trips |
| Differential fuzzing | 40M+ execs vs spng, **0 unresolved divergences** |
| Encode round-trip fuzzing | 5M+ execs, round-trip + spng cross-decode clean |
| Line coverage | **98.89%** (residual lines are unreachable defensive arms) |

The real-image corpus check is the `corpus_differential` test — opt in with a
public-dataset download and an env var:

```sh
crates/blazediff-png/scripts/fetch-corpus.sh
BLAZEDIFF_PNG_CORPUS=crates/blazediff-png/.corpus \
  cargo test -p blazediff-png --release --test corpus_differential -- --ignored --nocapture
```

The corpus tests are `#[ignore]`d, so the default `cargo test` needs no
network. With `--ignored` they fail if `BLAZEDIFF_PNG_CORPUS` is unset. CI runs
them through the `Benchmark PNG` workflow.

## Status

Experimental. Inside BlazeDiff it's opt-in behind the `BLAZEDIFF_PNG_ENABLED`
environment variable while it stabilizes; spng stays the default and the defensive
decode fallback.

## License

MIT
