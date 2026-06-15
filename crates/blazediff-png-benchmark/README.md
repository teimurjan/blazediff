# blazediff-png-benchmark

Decode and encode benchmarks for [`blazediff-png`](../blazediff-png) against the
three PNG codecs it's most often compared to:

- **spng** — the exact vendored [libspng](https://libspng.org) BlazeDiff itself
  links, so we measure the codec we actually ship, not a separately built one.
- **image-rs** [`png`](https://crates.io/crates/png) — pure-Rust, fdeflate encode.
- **zune-png** — the zune ecosystem codec.

## Running

```sh
cargo run --release -p blazediff-png-benchmark            # uses repo fixtures/
cargo run --release -p blazediff-png-benchmark -- path/   # custom corpus
cargo run --release -p blazediff-png-benchmark -- --parity
```

Decode times each codec's idiomatic full decode (blazediff and spng emit RGBA8;
image-rs and zune emit their native layout). Encode hands every codec the same
RGBA8 buffer and asks it to write a PNG at its **balanced default**: blazediff
at libdeflate level 4 (its speed/size knee — see the level note below), spng at
zlib level 6, image-rs/zune at their own defaults. Times are best-of with
size-scaled iteration counts; `--parity` instead asserts BlazeDiff's PNG output
is byte-identical with `BLAZEDIFF_PNG_ENABLED` on vs off.

## Results

34 PNGs, 342.7 MPx (up to 5600×3200), single-threaded on Apple Silicon (M-series).

### Decode

| Codec | Total | MPx/s | vs blazediff |
| --- | --- | --- | --- |
| **blazediff** | **1291 ms** | **265** | 1.00× |
| image-rs | 1509 ms | 227 | 1.17× slower |
| spng | 1788 ms | 192 | 1.38× slower |
| zune | 2033 ms | 169 | 1.57× slower |

### Encode (time)

| Codec | Total | MPx/s | vs blazediff |
| --- | --- | --- | --- |
| zune | 1040 ms | 330 | 5.7× faster¹ |
| **blazediff** | **5958 ms** | **58** | 1.00× |
| image-rs | 27389 ms | 13 | 4.6× slower |
| spng | 57262 ms | 6 | 9.6× slower |

¹ zune is faster still but writes ~6.4× larger files — see below.

### Encode (output size)

| Codec | Total | vs blazediff |
| --- | --- | --- |
| image-rs | 202885 KB | 97% |
| spng | 208315 KB | 100% |
| **blazediff** | **209334 KB** | **100%** |
| zune | 1340987 KB | 641% |

### A note on the encode level

blazediff's balanced default is libdeflate **level 4** — its speed/size knee.
Over this corpus the level curve is:

| level | encode | vs lvl 6 | size | vs lvl 6 |
| --- | --- | --- | --- | --- |
| 4 (default) | 5958 ms | **39% faster** | 209334 KB | +2.1% |
| 5 | ~7340 ms | 24% faster | 207788 KB | +1.4% |
| 6 | ~9674 ms | — | 204957 KB | — |

Level 6 costs ~60% more encode time than level 4 to shave ~2% off the file, so
level 4 is the better default for a screenshot-diffing workload that writes far
more than it ships. At **matched level 6** blazediff still encodes ~5.9× faster
than spng *and* ~2% smaller; the level-4 default trades that size edge for the
40%-faster encode above (now ~3% larger than image-rs, ~0.5% larger than spng).
Pass `compression: 6..=12` for the smallest output. zune trades a 6.4× size
penalty for its speed. Decode is fastest across the board.

Numbers move with hardware and corpus; rerun the command above to reproduce on
your machine.
