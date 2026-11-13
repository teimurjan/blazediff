# @blazediff/milo-native

## 0.2.0

### Minor Changes

- 0d8bbac: Smaller, faster PNG output. Output PNGs are now written in the smallest lossless color mode: a palette for images of at most 256 colors, gray, RGB or RGBA otherwise. A diff image has about 30 colors, so it becomes a palette PNG that is about 4x smaller at compression level 0. Decoded pixels do not change, but the file bytes do, so byte-for-byte snapshots of output PNGs need an update. On a 3598x16384 page screenshot, a diff with an output image takes 647 ms instead of 1286 ms on Linux. Compression levels 1 to 9 now use libdeflate and are 2 to 8x faster.

## 0.1.1

### Patch Changes

- e9d5472: Rebuild against the updated `blazediff-png` codec. With `BLAZEDIFF_PNG_ENABLED` set, PNG decode is faster, and a gray tRNS key is masked to the image bit depth as the PNG specification requires. The default spng path is unchanged.

## 0.1.0

### Minor Changes

- 93f18df: Add MILO, a learned perceptual image quality metric, as a new package family.

  MILO (Çoğalan et al., ACM TOG 2025) predicts a per-pixel visibility mask with a
  small convolutional network and pools the masked absolute error, so an error
  hidden in texture counts for less than the same error on a flat surface. The
  `blazediff-milo` crate embeds the authors' Apache-2.0 weights, runs the network
  through lane-generic SIMD kernels over every core, and is held to the PyTorch
  implementation's outputs by test. `@blazediff/milo-native` exposes it to Node
  with the same path/buffer/RGBA surface as `@blazediff/ssim-native`;
  `@blazediff/milo-wasm` is the same crate for browsers and edge runtimes.
