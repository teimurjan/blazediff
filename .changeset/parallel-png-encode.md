---
"@blazediff/rust-png": minor
---

Add `encode_parallel` behind a new `parallel` feature. It compresses the PNG data in fixed 256 KiB bands on several threads and joins them into one standard zlib stream. Any thread count gives the same bytes. On an M1 Max with 8 threads, a 4K photo encodes 3.8 to 4.0x faster than `encode` at levels 4 and 6, and a full-page screenshot 2.4 to 3.5x faster, with files between 0.6% smaller and 3.5% larger.
