# @blazediff/interpret-native

Native Rust **structured interpretation** of image diffs: what changed, where, and how much — not
just which pixels differ.

```bash
npm install @blazediff/interpret-native
```

```ts
import { interpret } from "@blazediff/interpret-native";

const result = await interpret("expected.png", "actual.png");
console.log(result.summary);
// "Low-impact visual change detected (0.18% of image, 2 regions).
//  Content added: 2 regions (center, bottom-right)."

for (const region of result.regions) {
  console.log(`${region.position}: ${region.changeType} (${region.pixelCount}px)`);
}
```

## Choosing how regions are found

The classifier is independent of whatever locates the change, so you pick the locator:

| `source` | How it finds regions | When |
| --- | --- | --- |
| `pixel` (default) | connected components over a per-pixel diff | exact boxes; the usual choice |
| `ssim`, `ms-ssim`, `hitchhikers-ssim` | thresholding a structural-similarity map | tolerant of imperceptible noise |

```ts
const loose = await interpret("expected.png", "actual.png", undefined, {
  source: "ms-ssim",
});
```

A metric's map is far coarser than a pixel, so its **boxes are blocky**. Its **numbers are not**:
every box is refined against the source pixels before anything is measured, so `pixelCount` and
`diffCount` are counts of actually-changed pixels on every source, never of map windows. On a real
fixture pair the pixel diff reports 776 changed pixels and MS-SSIM-located regions report 792.

## Regions you already have

If something else already knows where to look — DOM rectangles from a layout pass, a crop list —
skip the search:

```ts
import { interpretRegions } from "@blazediff/interpret-native";

const result = await interpretRegions("expected.png", "actual.png", [
  { x: 16, y: 16, width: 32, height: 32 },
]);
```

Boxes may be coarse; they are refined the same way. A box outside the image is rejected rather
than read past.

## Result

```ts
interface InterpretResult {
  summary: string;        // human-readable
  diffCount: number;      // actually-changed pixels
  totalRegions: number;
  regions: ChangeRegion[];
  severity: string;
  diffPercentage: number;
  width: number;
  height: number;
}
```

Each `ChangeRegion` carries a `changeType`, `shape`, `position`, `confidence`, and the statistics
behind them — colour delta, gradient/edge correlation, fill ratios, and the classifier's signals.

## Options

```ts
{
  source?: "pixel" | "ssim" | "ms-ssim" | "hitchhikers-ssim",

  // pixel source
  threshold?: number,     // Default: 0.1
  antialiasing?: boolean, // exclude AA pixels. Default: false
  compression?: number,   // PNG level for a written diff. Default: 0
  quality?: number,       // JPEG quality for a written diff. Default: 90

  // metric sources
  windowSize?: number,    // Default: 11
  regionFloor?: number,   // window score at/below which it counts as changed. Default: 0.99
}
```

Passing a third argument to `interpret` writes the diff visualization to that path (pixel source
only). Encoded PNG/JPEG/QOI buffers work in place of paths on the pixel source; the metric sources
need paths.

## Relationship to the other packages

`@blazediff/core-native` answers *where* pixels differ. `@blazediff/ssim-native` answers *how
alike* two images look. This package answers *what changed*, and is the only one of the three that
depends on the other two — they know nothing about interpretation.

## Platforms

macOS (arm64, x64), Linux (arm64, x64), Windows (arm64, x64). The binding is required; there is no
JS fallback.

## License

MIT
