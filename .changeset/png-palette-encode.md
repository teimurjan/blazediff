---
"@blazediff/codec-png-native": patch
"@blazediff/codec-png-wasm": patch
"@blazediff/rust-png": patch
---

Faster palette encode. The palette scan writes each pixel's index into a preallocated buffer, and an uncompressed 8-bit palette PNG is written straight from those indices without an intermediate buffer. Encoding a 5600x3200 image with 30 colors takes about half the time. Output bytes do not change.
