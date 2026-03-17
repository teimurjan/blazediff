# blazediff-interpret

Deterministic image diff analysis: region detection, content-aware classification, and structured summaries.

[![Crates.io](https://img.shields.io/crates/v/blazediff-interpret.svg)](https://crates.io/crates/blazediff-interpret)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Region detection** — Connected-component labeling to find discrete change regions
- **Content-aware classification** — Compares changed pixels against local background in both images to detect additions, deletions, shifts, and color changes
- **Spatial positions** — Classifies where changes occur (top-left, center, bottom-right, etc.)
- **Severity scoring** — Low / Medium / High based on diff percentage
- **Shape analysis** — Solid, contour frame, sparse, edge-dominated, or mixed
- **Color delta & gradient stats** — YIQ-based color difference and edge scoring per region
- **Structured summary** — Grouped by change type for CI/review
- **Compact mode** — Summary + compact regions for quick triage

Wraps [`blazediff`](https://crates.io/crates/blazediff) — runs the diff, then interprets the result into structured output.

## Installation

```bash
cargo install blazediff-interpret
```

## CLI Usage

```bash
# JSON output (default)
blazediff-interpret image1.png image2.png

# Compact output (summary + severity + compact regions)
blazediff-interpret image1.png image2.png --compact

# Text output
blazediff-interpret image1.png image2.png --output-format text

# Custom threshold + anti-aliasing detection
blazediff-interpret image1.png image2.png -t 0.05 --antialiasing
```

### Exit Codes

- `0` - Images are identical
- `1` - Images differ (JSON on stdout)
- `2` - Error

## Library Usage

```rust
use blazediff::{DiffOptions, Image};
use blazediff_interpret::interpret;

let options = DiffOptions {
    threshold: 0.1,
    ..Default::default()
};

let result = interpret(&img1, &img2, &options)?;
println!("{}", result.summary);
for region in &result.regions {
    println!("  {}: {} ({:.2}%)", region.position, region.change_type, region.percentage);
}
```

## Output Example

```json
{
  "summary": "Low-impact visual change detected (0.18% of image, 2 regions).\nContent added: 2 regions (bottom-right, center).",
  "total_regions": 2,
  "severity": "Low",
  "diff_percentage": 0.18,
  "regions": [
    {
      "bbox": { "x": 1014, "y": 211, "width": 20, "height": 20 },
      "pixel_count": 388,
      "percentage": 0.09,
      "position": "BottomRight",
      "shape": "SolidRegion",
      "change_type": "Addition",
      "confidence": 1.0,
      "signals": {
        "blends_with_bg_in_img1": true,
        "blends_with_bg_in_img2": false,
        "low_color_delta": false,
        "low_edge_change": true,
        "dense_fill": true,
        "sparse_fill": false,
        "tiny_region": false,
        "confidence": 1.0
      },
      "color_delta": { "mean_delta": 0.10, "max_delta": 0.10 },
      "gradient": { "edge_score": 0.0 }
    }
  ]
}
```

## Architecture

### Pipeline

`interpret()` runs a linear pipeline — diff the images, find where things changed, classify each region using content analysis, then detect shifts:

```
img1, img2
  │
  v
blazediff::diff()  ──>  output image (gray = unchanged, colored = changed)
  │                      uses alpha=0.0 to ensure clean grayscale for unchanged pixels
  v
extract_change_mask()  ──>  binary mask (R != G || R != B)
  │                         SIMD-accelerated on aarch64 (NEON, 16px/iter)
  v
detect_regions()
  ├── morph_close()                    bridge small gaps (dilate + erode)
  │     adaptive radius: (max(w,h) / 200).clamp(2, 15)
  ├── label_connected_components()     union-find, 4-connectivity
  ├── extract_labeled_regions()        bbox + pixel count per label
  v                                    (counts only original mask pixels)
per-region analysis
  ├── compute_shape_stats()    ──>  fill_ratio, border_ratio, inner_fill, ...
  │     classify_shape()       ──>  SolidRegion | ContourFrame | EdgeDominated | ...
  ├── classify_position()      ──>  3×3 grid: TopLeft, Center, BottomRight, ...
  ├── compute_color_delta()    ──>  YIQ perceptual delta (mean + max, 0–1)
  ├── compute_gradient_stats() ──>  Sobel-like edge_score (0–1)
  ├── analyze_content()        ──>  bg_distance per image (see Content Analysis)
  ├── classify_change_type()   ──>  Addition | Deletion | ContentChange | ...
  v
filter: drop RenderingNoise regions (not actionable)
  │
  v
detect_shifts()  ──>  match Addition+Deletion pairs by size + pixel count + luminance → Shift
  │
  v
classify_severity()  ──>  Low (<1%) | Medium (1–10%) | High (>10%)
build_summary()      ──>  structured overview grouped by change type
  │
  v
InterpretResult { summary, regions[], severity, diff_percentage, ... }
```

### Content analysis

The classifier compares changed pixels against local background in **both** source images to determine what happened:

1. **Background sampling** — collect unchanged pixels within the region's bounding box; fall back to a 1px border outside if all pixels changed
2. **Distance metric** — mean RGB Euclidean distance of changed pixels from background mean, normalized to [0, 1]
3. **Blend detection** — a region "blends with background" if:
   - `bg_distance < 0.08` (absolute threshold, ~35 RGB units), **or**
   - `bg_distance < other_image_distance × 0.5` (relative — handles textured backgrounds like maps)

This produces `ContentEvidence { bg_distance_img1, bg_distance_img2 }` used by the classifier.

### Classification rules

**Change type** (from content evidence + color delta + gradient + shape):

| Rule | Condition | Result |
|------|-----------|--------|
| 1 | tiny region (≤9px) + low color delta | RenderingNoise (filtered) |
| 2 | sparse fill + low color delta + low edge | RenderingNoise (filtered) |
| 3 | blends bg in img1, distinct in img2 | Addition |
| 4 | distinct in img1, blends bg in img2 | Deletion |
| 5 | low edge change | ColorChange |
| 6 | fallback | ContentChange |

Rules are evaluated in order; first match wins. RenderingNoise regions are dropped from the final output.

**Post-classification: shift detection**

After individual classification, Addition+Deletion pairs are matched by:
- Size similarity (width and height ratios within 0.6–1.67)
- Pixel count similarity (ratio within 0.67–1.5)
- Luminance similarity (mean diff < 0.15, stddev diff < 0.10)

Matching pairs are reclassified as `Shift`.

**Shape** (from fill/occupancy metrics on the bbox):

| Shape | Condition |
|-------|-----------|
| SolidRegion | fill > 0.65 |
| ContourFrame | inner_fill < 0.20 and (border > 0.60 or center_density < 0.10) |
| EdgeDominated | fill < 0.30 and border > 0.45 |
| SparseDistributed | fill < 0.30 and row_occ > 0.7 and col_occ > 0.7 |
| MixedRegion | fallback |

### Modules

```
lib.rs                    entry point: interpret(), detect_shifts(), build_summary()
main.rs                   CLI binary (clap)
napi.rs                   Node.js N-API bindings (feature-gated)
types.rs                  all structs + enums (Serde-enabled)
io.rs                     shared image loading (PNG, JPEG, QOI)
│
├── region/
│   ├── mod.rs            extract_change_mask (SIMD), detect_regions, label_connected_components
│   ├── morphology.rs     dilate, erode, morph_close (separable, O(n))
│   └── label_extract.rs  label map → ComponentInfo (bbox + pixel count)
│
├── content_analysis.rs   analyze_content (bg distance), luminance_stats
├── interpretation.rs     classify_change_type
├── shape.rs              compute_shape_stats, classify_shape
├── spatial.rs            classify_position (bbox center → 3×3 grid)
├── color_delta.rs        compute_color_delta (YIQ via blazediff)
├── gradient.rs           compute_gradient_stats (Sobel luminance gradients)
└── severity.rs           classify_severity (diff % → Low/Medium/High)
```

### Key types

```rust
InterpretResult
├── summary: String
├── total_regions: usize
├── severity: ChangeSeverity        // Low | Medium | High
├── diff_percentage: f64
├── width: u32
├── height: u32
├── regions: Vec<ChangeRegion>
│   ├── bbox: BoundingBox           // x, y, width, height
│   ├── pixel_count: u32
│   ├── percentage: f64
│   ├── position: SpatialPosition   // 9 zones (3×3 grid)
│   ├── shape: ChangeShape          // 5 categories
│   ├── shape_stats: ShapeStats     // 6 metrics
│   ├── change_type: ChangeType     // Addition | Deletion | Shift | ContentChange | ColorChange
│   ├── signals: ClassificationSignals  // 7 bools + confidence
│   ├── confidence: f32
│   ├── color_delta: ColorDeltaStats    // mean_delta, max_delta
│   └── gradient: GradientStats         // edge_score
└── to_compact() → CompactResult    // summary + severity + compact regions only
```

## License

MIT
