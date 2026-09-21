# @blazediff/milo-wasm

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
