# @blazediff/ssim-native

## 6.2.0

### Minor Changes

- 0d8bbac: Smaller, faster PNG output. Output PNGs are now written in the smallest lossless color mode: a palette for images of at most 256 colors, gray, RGB or RGBA otherwise. A diff image has about 30 colors, so it becomes a palette PNG that is about 4x smaller at compression level 0. Decoded pixels do not change, but the file bytes do, so byte-for-byte snapshots of output PNGs need an update. On a 3598x16384 page screenshot, a diff with an output image takes 647 ms instead of 1286 ms on Linux. Compression levels 1 to 9 now use libdeflate and are 2 to 8x faster.

## 6.1.1

### Patch Changes

- e9d5472: Rebuild against the updated `blazediff-png` codec. With `BLAZEDIFF_PNG_ENABLED` set, PNG decode is faster, and a gray tRNS key is masked to the image bit depth as the PNG specification requires. The default spng path is unchanged.

## 6.1.0

## 6.0.0
