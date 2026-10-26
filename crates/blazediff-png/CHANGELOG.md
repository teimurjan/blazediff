# @blazediff/rust-png

## 6.1.0

### Minor Changes

- 37b5015: Publish the `blazediff-png` codec to npm. `@blazediff/codec-png-native` is an N-API addon with prebuilt binaries for macOS, Linux and Windows on x64 and arm64. `@blazediff/codec-png-wasm` is the same codec as a 150 KB WebAssembly module for browsers, edge runtimes, Deno and Node.js. Both export `decode`, `encode` and a `{ read, write }` codec object with the same shape as `@blazediff/codec-pngjs`. The crate gains the `napi` and `wasm` features that build them.
- 37b5015: Add `encode_parallel` behind a new `parallel` feature. It compresses the PNG data in fixed 256 KiB bands on several threads and joins them into one standard zlib stream. Any thread count gives the same bytes. On an M1 Max with 8 threads, a 4K photo encodes 3.8 to 4.0x faster than `encode` at levels 4 and 6, and a full-page screenshot 2.4 to 3.5x faster, with files between 0.6% smaller and 3.5% larger.

### Patch Changes

- 37b5015: Decode PNG files up to 1.3x faster. The Paeth filter now uses the shorter threshold form of the predictor from stb_image. On aarch64, the Avg filter runs on NEON for 4- and 8-byte pixels. Output is byte-identical. On an M1 Max, total decode time over the benchmark fixtures dropped 10%.
- 37b5015: Mask a gray tRNS key to the image bit depth before the decoder compares it, as PNG 3rd edition (11.3.1.1) requires. spng compares the full 16-bit value, so a key with bits set above the bit depth never matched, and those pixels stayed opaque. They now decode as transparent, as in image-rs. Only files from encoders that do not zero the unused bits are affected.

## 6.0.0

## 5.4.0

### Patch Changes

- 5eb8819: Speed up the stored (level-0) PNG encode ~2.7x with libdeflate checksums

  The chunk CRC-32 and the stored-stream Adler-32 dominated the level-0 encode
  (~63% and ~16% of it on a 59 MPx image): crc32fast's aarch64 path is a serial
  `__crc32d` dependency chain and `simd-adler32` trails libdeflate's SIMD kernels.
  Both now route through the libdeflate the zlib backend already links (carry-less
  CRC folding, ~7x; SIMD Adler-32, ~1.7x). Output PNGs are byte-identical — the
  checksums are the same values, computed faster — and a dependency-free reference
  test now pins every chunk CRC and the stored Adler trailer (decoders ignore
  both, so nothing checked them before). The pure-Rust `rust-backend` keeps
  crc32fast / simd-adler32.

## 5.3.0

## 5.2.0

## 5.1.0
