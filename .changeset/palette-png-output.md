---
"@blazediff/core-native": minor
"@blazediff/ssim-native": minor
"@blazediff/interpret-native": minor
"@blazediff/milo-native": minor
---

Smaller, faster PNG output. Output PNGs are now written in the smallest lossless color mode: a palette for images of at most 256 colors, gray, RGB or RGBA otherwise. A diff image has about 30 colors, so it becomes a palette PNG that is about 4x smaller at compression level 0. Decoded pixels do not change, but the file bytes do, so byte-for-byte snapshots of output PNGs need an update. On a 3598x16384 page screenshot, a diff with an output image takes 647 ms instead of 1286 ms on Linux. Compression levels 1 to 9 now use libdeflate and are 2 to 8x faster.
