---
"@blazediff/core-native": patch
"@blazediff/core-wasm": patch
---

Faster default YIQ diff in the Rust core. The diff now scans each row of blocks in pixel-row order, then draws that band while it is still in the CPU cache. The N-API binding reads raw RGBA inputs in place and draws into the caller's output buffer, so it no longer copies them. If two images are byte-identical and no output is requested, `@blazediff/core-wasm` in Node returns early through `Buffer.compare`. On a 3598x16384 page screenshot, a count-only native `diff` takes 11 ms instead of 38 ms. With a diff image it is also about 3.5x faster, and in wasm it is about 2.4x faster. An identical 4K pair takes about 2.4 ms on both. Counts and output bytes do not change.
