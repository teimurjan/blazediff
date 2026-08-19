# @blazediff/ssim-native

Native Rust structural-similarity metrics for Node.js: **SSIM, MS-SSIM, Hitchhiker's SSIM and
perceptual SSIM**, through N-API. Decodes PNG, JPEG and QOI.

Where a pixel diff answers *which pixels changed*, these answer *how alike two images look* — one
pooled score in 0-1, where 1 is identical. That is the right question when anti-aliasing, font
hinting or a codec's rounding moves a few thousand pixels by one unit and the run goes red for no
reason a human would call a change.

```bash
npm install @blazediff/ssim-native
```

The platform binary installs as an optional dependency; there is no compile step.

## Usage

```ts
import { compare } from "@blazediff/ssim-native";

const result = await compare("expected.png", "actual.png", "map.png", {
  metric: "ms-ssim",
  minScore: 0.99,
});

if (result.match) {
  console.log(`close enough: ${result.score}`);
} else if (result.reason === "score-below-threshold") {
  console.log(`scored ${result.score}, ${result.belowCount} windows below the floor`);
}
```

`compare` takes two file paths or two encoded buffers (Node `Buffer` works directly). Passing a
third argument renders the local score map to that path as grayscale, dark where the score is low.

`result` is a discriminated union:

| `match` | `reason` | Carries |
| --- | --- | --- |
| `true` | — | `score`, `metric`, `mapWidth`, `mapHeight` |
| `false` | `"score-below-threshold"` | the above plus `belowCount`, `belowPercentage` |
| `false` | `"layout-diff"` | — the images are different sizes |
| `false` | `"file-not-exists"` | `file` |

## Metrics

| Metric | What it does |
| --- | --- |
| `ssim` (default) | Gaussian-windowed single-scale SSIM, with the automatic downsample to ~256px on the short edge that MATLAB's `ssim.m` does |
| `ms-ssim` | SSIM pooled across a 5-octave dyadic pyramid. Needs ≥176px on the short edge |
| `hitchhikers-ssim` | Box windows over five integral images, pooled by coefficient of variation. Every window sum is an O(1) summed-area-table lookup |
| `perceptual-ssim` | The tunable variant: CIE L\*a\*b\*, chroma weighting, chroma subsampling, MAD pooling. At its defaults it reduces *bit-identically* to `ms-ssim` |

## Raw RGBA

If you already have decoded pixels, skip the codec entirely. These are synchronous:

```ts
import { msSsim, renderMap } from "@blazediff/ssim-native";

const result = msSsim(rgba1, rgba2, width, height, { returnMap: true });
const grayscale = renderMap(result.map!, result.mapWidth, result.mapHeight, width, height);
```

`ssim`, `msSsim`, `hitchhikersSsim` and `perceptualSsim` all take
`(base, comparison, width, height, options?)`.

## Options

```ts
{
  metric?: "ssim" | "ms-ssim" | "hitchhikers-ssim" | "perceptual-ssim",
  minScore?: number,   // identical at or above this. Default: 1
  returnMap?: boolean, // include the Float32Array map. Default: false

  // shared by every metric
  windowSize?: number, // Default: 11
  k1?: number,         // Default: 0.01
  k2?: number,         // Default: 0.03
  bitDepth?: number,   // Default: 8, so L = 255

  msSsim?: { weights?: number[]; method?: "product" | "weighted-sum" },
  hitchhikers?: { windowStride?: number; covPooling?: boolean },
  perceptual?: {
    weights?: number[]; method?: "product" | "weighted-sum";
    color?: "gamma-luma" | "lab"; chromaWeight?: number; chromaSubsample?: number;
    pooling?: "mean" | "mad"; deviationWeight?: number;
  },

  compression?: number, // PNG level for a rendered map. Default: 0
  quality?: number,     // JPEG quality for a rendered map. Default: 90
}
```

The map is withheld unless `returnMap` is set — it is one float per window and costs a copy across
the binding.

## Faster PNG decoding

Decoding is shared with `@blazediff/core-native` (both sit on the `blazediff-shared` crate), so the
same opt-in applies here. Setting `BLAZEDIFF_PNG_ENABLED=1` routes PNG decode through BlazeDiff's
in-house codec instead of libspng:

```bash
BLAZEDIFF_PNG_ENABLED=1 node compare.mjs
```

Worth roughly 15% off a 4K `compare()` call, with byte-identical decoded pixels and therefore an
unchanged score. It's read once per process, and only affects the path and buffer APIs — the raw
RGBA entry points never decode anything.

## Accuracy

The Rust implementation's tap-by-tap accumulation order is frozen to
[`@blazediff/ssim`](https://www.npmjs.com/package/@blazediff/ssim), the TypeScript port whose
MATLAB agreement was measured, so this package inherits that agreement rather than drifting from
it. The two ports are held to within 5e-6 of each other by tests on both sides; SSIM lands within
0.03% of MATLAB across the fixture set.

Two things worth knowing:

- `ms-ssim` with the default `"product"` pooling returns `NaN` for globally anticorrelated content
  (an inverted image). Both references degenerate the same way — the JS gives `NaN`, MATLAB gives a
  complex number. `"weighted-sum"` stays finite.
- All three shipped metrics reduce to luma, so a change carried entirely by chroma or alpha is
  invisible to them. `perceptual-ssim` with `color: "lab"` and a non-zero `chromaWeight` sees
  colour.

Scores are pooled over a local map, so these say *how much* two images differ, not *where* beyond
the map's resolution. For exact locations, use
[`@blazediff/core-native`](https://www.npmjs.com/package/@blazediff/core-native).

## Relationship to @blazediff/core-native

`@blazediff/core-native` is a pixel diff: it answers *where* two images differ. This package
answers *how alike* they look — a different question, so it is a different package rather than a
flag on that one. It exposes the whole crate: every stability constant, both pooling methods,
Hitchhiker's stride, all of `perceptual-ssim`, and the score map itself.

The two are independent and share no code but the decoders; installing one does not pull in the
other.

## Platforms

macOS (arm64, x64), Linux (arm64, x64) and Windows (arm64, x64). The binding is required: unlike
`@blazediff/core-native` there is no CLI to fall back to, so an unsupported platform throws.

## License

MIT
