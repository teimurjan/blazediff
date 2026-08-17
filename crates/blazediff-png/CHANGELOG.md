# @blazediff/rust-png

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
