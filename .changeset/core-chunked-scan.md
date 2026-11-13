---
"@blazediff/core": patch
---

Faster default YIQ diff. A new scan replaces the two-pass block scan. It walks the image in chunks of 4096 pixels and skips identical chunks with a native compare. It drops groups of 4 near-equal pixels with one masked XOR. It runs the YIQ metric without branches and checks anti-aliasing only on pixels over the threshold. The gray background of the diff image now comes from an exact integer-luma table. A count-only `diff` is now about 7.2x faster than pixelmatch in total benchmark time (it was 3.2x). With a diff image, it is about 3.2x faster (it was 2x). Counts and output bytes do not change.
