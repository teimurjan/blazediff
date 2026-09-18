# @blazediff/milo-native

Native Rust **MILO** for Node.js: a learned perceptual image quality metric that models visual
masking, through N-API. Decodes PNG, JPEG and QOI. No PyTorch, no model download.

MILO (Çoğalan et al., ACM TOG 2025) looks at both images with a small convolutional network and
predicts, per pixel, how visible an error there would be: a one-unit shift across a busy texture
scores far less than the same shift across a flat panel, because that is what a person sees.
Where `@blazediff/ssim-native` answers *how alike do these look* with a formula from 2004, this
answers it with a network trained against human opinion scores, and the paper reports it ahead
of LPIPS and DISTS at a fraction of their cost.

```bash
npm install @blazediff/milo-native
```

The platform binary installs as an optional dependency; there is no compile step.

## Usage

```ts
import { compare } from "@blazediff/milo-native";

const result = await compare("expected.png", "actual.png", "map.png", {
  maxError: 0.001,
});

if (result.match) {
  console.log(`not visibly different: ${result.rawError}`);
} else if (result.reason === "error-above-threshold") {
  console.log(`raw error ${result.rawError}, MOS ${result.mos.toFixed(2)}`);
}
```

`compare` takes two file paths or two encoded buffers (Node `Buffer` works directly). Passing a
third argument renders the per-pixel error map to that path as grayscale, bright where the
perceived error is high.

`result` is a discriminated union:

| `match` | `reason` | Carries |
| --- | --- | --- |
| `true` | | `rawError`, `mos`, `width`, `height` |
| `false` | `"error-above-threshold"` | the same |
| `false` | `"layout-diff"` | nothing: the images are different sizes |
| `false` | `"file-not-exists"` | `file` |

## The two numbers

- **`rawError`** is the metric: the mean over pixels and channels of `mask * |expected - actual|`.
  Exactly `0` for identical images and growing with visible damage; typical screenshot regressions
  land between 0.0002 and 0.01. `maxError` thresholds on this, and defaults to `0`.
- **`mos`** is `rawError` on KADID-10k's 1-5 mean-opinion-score scale, through the metric's learned
  calibration. It is for reading, not thresholding: the calibration tops out around 4.35 rather
  than 5 for identical images.

## Raw RGBA

If you already have decoded pixels, skip the codec entirely. This one is synchronous:

```ts
import { milo, renderMap } from "@blazediff/milo-native";

const result = milo(rgba1, rgba2, width, height, { returnMaps: true });
if ("errorMap" in result && result.errorMap) {
  const grayscale = renderMap(result.errorMap, width, height);
}
```

## Options

```ts
{
  maxError?: number,    // identical at or below this raw error. Default: 0
  threads?: number,     // Default: every core. The answer never depends on it
  returnMaps?: boolean, // include `mask` and `errorMap` Float32Arrays. Default: false
  compression?: number, // PNG level for a rendered map. Default: 0
  quality?: number,     // JPEG quality for a rendered map. Default: 90
}
```

The maps are withheld unless `returnMaps` is set; each is one float per pixel and costs a copy
across the binding. `mask` is the visibility mask (values in `(0, 4)`, one sigmoid per pyramid
level), `errorMap` the per-pixel perceived error in `0..1`.

## Cost

This is a CNN, not a formula: about 116k floating-point operations per pixel, three orders of
magnitude more than SSIM. The crate keeps it practical with a line-buffer pipeline (a few
megabytes of memory whatever the image size), SIMD kernels at ~75% of the CPU's f32 peak, and row
bands across every core. On an M1 Max a 1328x1228 pair takes 0.38s, a 1320x2868 pair 0.83s; budget
about half a second for 1080p on a laptop, and a few seconds on one core.

Images must be at least 16px on each side, the floor of the reference implementation. Alpha is
ignored, as the reference converts to RGB.

## Accuracy

The Rust implementation embeds the authors' published weights unchanged and is tested against the
outputs of their PyTorch code on this repo's fixtures: within 2e-6 relative on `rawError` and
1.2e-6 on `mos`, with the mask and error map checked pixel by pixel on synthetic pairs. The
residual is floating-point summation order. See the
[`blazediff-milo`](https://crates.io/crates/blazediff-milo) crate for the details, and
`licenses/MILO.md` in the repository for the weights' Apache-2.0 attribution.

## Relationship to the other packages

`@blazediff/core-native` is a pixel diff: *where* did two images differ. `@blazediff/ssim-native`
is structural similarity: *how alike* do they look, by formula. This package answers the same
question as the second with a learned model of what people notice. The three are independent and
share no code but the decoders; installing one does not pull in the others.

## Platforms

macOS (arm64, x64), Linux (arm64, x64) and Windows (arm64, x64). The binding is required: there is
no CLI to fall back to, so an unsupported platform throws. For browsers and edge runtimes, use
[`@blazediff/milo-wasm`](https://www.npmjs.com/package/@blazediff/milo-wasm), the same crate
compiled to WebAssembly.

## License

MIT. The embedded weights are Apache-2.0, copyright the MILO authors.
