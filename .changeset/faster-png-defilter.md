---
"@blazediff/rust-png": patch
---

Decode PNG files up to 1.3x faster. The Paeth filter now uses the shorter threshold form of the predictor from stb_image. On aarch64, the Avg filter runs on NEON for 4- and 8-byte pixels. Output is byte-identical. On an M1 Max, total decode time over the benchmark fixtures dropped 10%.
