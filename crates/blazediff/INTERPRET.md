# Interpret

Structured region analysis that takes a raw pixel diff and produces human-readable change descriptions. Available via `--interpret` in the CLI or `interpret()` in the library.

## Pipeline

```
change mask → morph close → connected components → per-region analysis → classify → describe
```

## 1. Change Mask Extraction

Extracts a binary mask from the diff output. A pixel is marked as changed when any channel differs from the "identical" color:

```
changed(x, y) = R ≠ G ∨ R ≠ B
```

NEON-accelerated on aarch64.

## 2. Morphological Closing

Bridges small gaps between nearby changed pixels using separable dilate + erode with an adaptive radius:

```
radius = clamp(max(width, height) / 200, 2, 15)
```

Both operations use a sliding-window max/min with running counts for O(n) per scanline. The kernel is `2·radius + 1` pixels wide.

## 3. Connected Components

Two-pass union-find with path compression and 4-connectivity (no diagonals):

1. **Pass 1** — Label each foreground pixel; union with left (x−1) and top (y−width) neighbors.
2. **Pass 2** — Flatten roots to sequential labels 1..N.

Only pixels from the original mask (pre-morphology) are counted toward each region's pixel count.

## 4. Per-Region Analysis

Each region's bounding box is analyzed across four dimensions:

### Shape Statistics

| Metric | Formula |
|---|---|
| Fill ratio | `pixel_count / bbox_area` |
| Border ratio | `border_pixels / pixel_count` (band = `clamp(min(w,h)/4, 1, 12)`) |
| Inner fill ratio | `inner_pixels / inner_area` (interior excluding border band) |
| Center density | `center_pixels / center_area` (middle 50% of bbox) |
| Row occupancy | `rows_with_≥1_pixel / total_rows` |
| Col occupancy | `cols_with_≥1_pixel / total_cols` |

**Shape classification:**

```
fill_ratio > 0.65                                                → solid-region
inner_fill < 0.20 ∧ (border > 0.60 ∨ (center < 0.10 ∧ border > 0.30 ∧ fill < 0.50)) → contour-frame
fill < 0.30 ∧ border > 0.45                                     → edge-dominated
fill < 0.30 ∧ row_occ > 0.7 ∧ col_occ > 0.7                    → sparse-distributed
otherwise                                                        → mixed-region
```

### Color Delta

Per-pixel YIQ color distance, normalized to [0, 1]:

```
mean_delta = mean(yiq_distance(img1[p], img2[p])) / MAX_YIQ_DELTA
max_delta  = max(yiq_distance(img1[p], img2[p]))  / MAX_YIQ_DELTA
```

### Gradient / Edge Score

Luminance via standard BT.601 coefficients:

```
L = 0.299·R + 0.587·G + 0.114·B
```

Central-difference gradients:

```
gx = (L[x+1] − L[x−1]) · 0.5
gy = (L[y+1] − L[y−1]) · 0.5
```

Edge score is the fraction of changed pixels with strong gradients:

```
edge_score = count(gx² + gy² ≥ 900) / total_changed_pixels
```

### Background Distance

Mean Euclidean RGB distance from the region's changed pixels to the local background (unchanged pixels within the bbox, or a 1px border fallback):

```
bg_distance = mean(√((R−Rbg)² + (G−Gbg)² + (B−Bbg)²)) / (√3 · 255)
```

## 5. Change Type Classification

Six-label decision tree evaluated in order. First matching rule wins:

| # | Rule | Conditions | Confidence |
|---|---|---|---|
| 1 | rendering-noise | `bbox_area ≤ 9 ∧ mean_delta < 0.05` | 1.0 |
| 2 | rendering-noise | `fill < 0.35 ∧ mean_delta < 0.05 ∧ edge_score < 0.05` | matched / 3 |
| 3 | addition | `blends_bg1 ∧ ¬blends_bg2` | 1.0 |
| 4 | deletion | `¬blends_bg1 ∧ blends_bg2` | 1.0 |
| 5 | color-change | `edge_score < 0.05` | 0.75 or 1.0 |
| 6 | content-change | fallback | 0.5 |

**Background blending signals:**

```
blends_bg(img) = bg_distance < 0.08 ∨ (bg_distance_other > 0.08 ∧ bg_distance < bg_distance_other · 0.5)
```

## 6. Shift Detection (Post-Classification)

After initial classification, addition–deletion pairs are matched as shifts when all criteria pass:

| Criterion | Threshold |
|---|---|
| Width ratio | 0.6 – 1.67 (40% tolerance) |
| Height ratio | 0.6 – 1.67 |
| Pixel count ratio | 0.67 – 1.5 (50% tolerance) |
| Luminance mean difference | < 0.15 (normalized) |
| Luminance stddev difference | < 0.10 (normalized) |

Matched pairs are reclassified as `shift`.

## 7. Severity

```
diff_percentage < 1%   → low
diff_percentage ≤ 10%  → medium
diff_percentage > 10%  → high
```

## 8. Spatial Position

Bbox center mapped to a 3×3 grid (image divided into thirds horizontally and vertically):

```
col = 0 if cx < w/3, 1 if cx < 2w/3, else 2
row = 0 if cy < h/3, 1 if cy < 2h/3, else 2
```

Produces: `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`.

## Output

Rendering-noise regions are dropped. Remaining regions are sorted by pixel count (descending) and summarized:

```
Moderate visual change detected (1.87% of image, 10 regions).
Content changed: 4 regions (bottom, center).
Content added: 3 regions (right, bottom, bottom-left).
Content removed: 3 regions (bottom, top-left, center).
```
