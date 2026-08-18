# Interpret

Structured region analysis that takes a raw pixel diff and produces human-readable change descriptions. It lives in the [`blazediff-interpret`](../blazediff-interpret) crate — `interpret()` in the library, `blazediff-interpret` on the command line, `@blazediff/interpret-native` from JavaScript.

## Pipeline

```
change mask → morph close → connected components → noise census + speck floor
            → bbox merge → adaptive noise floor → per-region analysis → classify
            → shift pairing → margin → describe
```

Everything is deterministic: the same input pair always produces the same regions and labels. No model, no weights, no randomness.

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

1. **Pass 1** - Label each foreground pixel; union with left (x−1) and top (y−width) neighbors.
2. **Pass 2** - Flatten roots to sequential labels 1..N.

Only pixels from the original mask (pre-morphology) are counted toward each region's pixel count.

## 4. Region Assembly

Raw components are noisy on real-world pairs — a recompressed or AI-regenerated photograph shatters into hundreds of tiny fragments. Three deterministic steps turn components into regions:

### Noise census

Before anything is dropped, the components are counted:

```
n_specks = count(components with pixel_count < 64)
```

This is a robust readout of how noisy the *pair* is. A clean UI render produces ~0 specks; a diffusion-regenerated photo produces hundreds. The noise floor below scales with it, so clean pairs keep their smallest real regions while noisy pairs shed their fragment storm.

### Speck floor and bbox merge

```
drop components with pixel_count < 8                   (specks at any scale)
merge components whose bboxes overlap or sit within
  12 px horizontally / 8 px vertically of each other   (iterated to fixpoint)
```

Fragmented detections — one inpainted object shattered into dozens of patches, or the words of one recolored text run — have heavily interleaved bounding boxes, while genuinely separate changes do not. Merging by bbox proximity reassembles them without the over-bridging a larger morphological radius would cause. Horizontal slack is wider than vertical because text fragments on a line sit further apart than the strokes within them. Merged regions union their bboxes and sum their pixel counts.

### Adaptive noise floor

```
floor = max(12, 3 · n_specks) pixels
drop merged regions with pixel_count < floor
```

For a clean render the floor stays at 12 px (a recolored status dot survives). For a noisy photo pair with ~250 specks the floor rises to ~750 px, which removes ringing and re-encode fragments wholesale.

## 5. Per-Region Analysis

Each region's bounding box is analyzed across six dimensions. Coarse or caller-supplied regions are first refined to actually-changed pixels (YIQ squared delta ≥ 100); if a claimed region refines to *zero* pixels but the content does differ — a sub-threshold edit such as a subtle uniform recolor — the caller's mask is kept so the region still gets meaningful statistics.

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
mean_delta  = mean(|yiq_distance(img1[p], img2[p])|) / MAX_YIQ_DELTA
max_delta   = max(|yiq_distance(img1[p], img2[p])|)  / MAX_YIQ_DELTA
delta_stddev = stddev(|yiq_distance(img1[p], img2[p])| / MAX_YIQ_DELTA)
```

`delta_stddev` distinguishes uniform color shifts (low stddev) from patchy texture changes (high stddev).

### Chroma Statistics

The YIQ delta above weights luminance heavily, and luminance correlation saturates on photographic edits — an inpainting model regenerates the texture whether the semantic edit was a recolor or a replacement. What separates the two is how the *color mass* moved, measured on the I/Q chroma plane over the changed pixels (all normalized to 255):

| Metric | Formula | Reads as |
|---|---|---|
| `mean_abs_dy` / `mean_dy` | mean \|ΔY\| and signed mean ΔY | did luminance move, and consistently in one direction? |
| `mean_abs_di`, `mean_abs_dq` | mean \|ΔI\|, mean \|ΔQ\| | per-axis chroma movement |
| `mean_abs_dc` | mean √(ΔI² + ΔQ²) | total chroma movement |
| `chroma_cos` | Σ(I₁I₂ + Q₁Q₂) / Σ(\|c₁\|\|c₂\|) | ~1 = same hues, negative = coherent hue rotation |
| `sat1`, `sat2` | mean chroma magnitude per image | was the content colorful before / after? |
| `chroma_rough` | mean \|∇\|Δc\|\| between adjacent changed pixels / stddev(\|Δc\|) | low = smooth recolor, high = scattered replacement |

A recolor moves chroma *coherently* — one hue rotation, a smooth delta field. A replacement shuffles texture and scatters it.

### Dual-Image Gradient / Edge Score

Luminance via standard BT.601 coefficients:

```
L = 0.299·R + 0.587·G + 0.114·B
```

Central-difference gradients computed on **both** images independently:

```
gx = (L[x+1] − L[x−1]) · 0.5
gy = (L[y+1] − L[y−1]) · 0.5
is_edge(p) = gx² + gy² ≥ 900
```

Three metrics:

| Metric | Formula | Purpose |
|---|---|---|
| `edge_score` | `edges_img1 / total` | Edge density in before image |
| `edge_score_img2` | `edges_img2 / total` | Edge density in after image |
| `edge_correlation` | `agree(is_edge₁ = is_edge₂) / total` | Spatial alignment of edges between images |

### Luminance NCC

Normalized cross-correlation of per-pixel luminance between the two images over the changed pixels. High values (→ 1.0) mean the structural pattern is preserved — the edit recolored existing content. Near-zero means the structure was replaced. A region flat in both images returns 1.0 (nothing to disagree on); flat in exactly one returns 0.0 (structure appeared or vanished).

### Background Distance

Mean Euclidean RGB distance from the region's changed pixels to the local background (unchanged pixels within the bbox, or a 1px border fallback), computed for each image separately:

```
bg_distance = mean(√((R−Rbg)² + (G−Gbg)² + (B−Bbg)²)) / (√3 · 255)
```

Low distance = the pixels blend into the background there = the content was absent in that image.

## 6. Change Type Classification

Six-label rule cascade evaluated in order. First matching rule wins.

**Derived signals:**

```
tiny_region        = bbox_area ≤ 25
low_color_delta    = mean_delta < 0.05
low_edge_change    = edge_score < 0.05        (img1)
low_edge_img2      = edge_score_img2 < 0.05   (img2)
edges_correlated   = (low_edge_change ∧ low_edge_img2) ∨ edge_correlation > 0.85
sparse_fill        = fill_ratio < 0.35
highly_patchy      = delta_stddev > mean_delta · 2 + 0.1
structure_preserved = luminance_ncc > 0.55
structure_replaced  = luminance_ncc < 0.05
blends_bg(img)     = bg_distance < 0.08 ∨ (bg_distance_other > 0.08 ∧ bg_distance < bg_distance_other · 0.5)
strong_bg_asymmetry = one image blends, the other doesn't, and the distinct
                      side's bg_distance is > 2× the blending side's
```

**The cascade:**

| # | Rule | Conditions |
|---|---|---|
| 1 | rendering-noise | `tiny_region ∧ low_color_delta` |
| 2 | rendering-noise | `sparse_fill ∧ low_color_delta ∧ low_edge_change ∧ ¬strong_bg_asymmetry` |
| 3 | addition | `blends_bg1 ∧ ¬blends_bg2 ∧ (strong_bg_asymmetry ∨ gained_structure ∨ ¬structure_preserved)` |
| 4 | deletion | mirror of Rule 3 |
| 5 | color-change | structural recolor: `structure_preserved ∧ delta_evidence ∧ ¬(structure_replaced ∧ highly_patchy)` |
| 5b | color-change | photographic recolor: chroma-coherence test (below) |
| 6 | content-change | fallback |

Rule 2's `¬strong_bg_asymmetry` veto matters: sparse, faint edits — thin strokes, light text, a block vacated to background fill — carry the addition/deletion signature and are real changes, not noise.

Rules 3–4 require, beyond the blend asymmetry, either a strong asymmetry, an edge-density change ≥ 0.04 in the matching direction (`gained_structure` / `lost_structure`), or unpreserved structure — so recolors where both images hold plausible content are not pulled in. Confidence is 0.9, or 1.0 when the edge asymmetry confirms the direction.

**Rule 5 — structural recolor.** The evidence is preserved luminance structure (`NCC > 0.55`). The usual delta gate `¬low_color_delta` is loosened for *chromatic-only* recolors: same-luminance hue swaps (Tailwind `text-blue-600` → `text-red-600`) carry a tiny YIQ delta but are unmistakably visible, so `NCC > 0.88 ∧ edges_correlated ∧ mean_delta > 5·10⁻⁵` also counts as delta evidence.

**Rule 5b — photographic recolor.** When structure is *not* preserved (an inpainting model regenerated the texture), the chroma statistics decide:

```
big_chroma_move = mean_abs_dc > 0.131 ∧ chroma_rough < 0.75

if big_chroma_move:
    same_hue_family = chroma_cos > 0.235 ∧ mean_abs_dq ≤ 0.071 ∧ sat1 > 0.072
    ¬same_hue_family                        → color-change
else:
    mean_dy > 0.268                         → color-change   (consistent lightening)
    mean_dy ≤ −0.150 ∧ edge_score_img2 ≤ 0.101 → color-change (darkening w/o new structure)
```

In words: a large *coherent* chroma move is a recolor — a hue rotation, color introduced onto drab content, or strong movement on the Q axis — unless the hues stayed in the same family on already-colorful content, which means texture moved rather than hue. A small chroma move only reads as a recolor when luminance was pushed consistently in one direction. Thresholds are calibrated on the `inpaintcoco` ColorChange/ContentChange boundary.

## 7. Shift Detection (Post-Classification)

A pass over the classified regions finds pairs where the content that left one location in img1 is the content that appeared at another location in img2, and relabels both halves `shift`.

**Candidates are wide** — Addition, Deletion, ContentChange, ColorChange, and even RenderingNoise regions can be one half of a shift, because the classifier sees each location in isolation: a moved block landing on similar content reads as ContentChange, a vacated spot with imperfect background fill reads as ContentChange, and both halves of a low-contrast move can read as Deletion. Only a ColorChange×ColorChange pair is excluded (two pure recolors cannot be a move).

**Precision comes from the matcher.** For each size-compatible pair (width and height ratios within 0.55–1.82), both boxes are cropped to their common size around their centers, and the img1 crop at the source is compared against the img2 crop at the destination:

| Test | Threshold |
|---|---|
| Luminance NCC between the crops | ≥ 0.80 |
| Normalized mean absolute luminance difference (MAD) | ≤ 0.15 |
| Flat crops (variance < 4): MAD alone | ≤ 0.05 |
| Flat crops: ring contrast (crop mean vs 1px surrounding ring, both images) | > 20 |

The ring-contrast gate stops flat *background* from matching itself — the vacated spot in img2 against the untouched spot in img1 passes the mean test, but background never stands out from its own surroundings. When correlation is borderline (NCC ≥ 0.45), the destination anchor is retried at ±3 px offsets, which recovers detection boxes that trail the true block edges.

Both directions are tried per unordered pair; the better score wins. All candidate pairs are scored first and then matched **best-score-first**, so a region pairs with its true partner rather than the first plausible one.

## 8. Output Margin

Detected regions are reported with a small scale-relative margin on the bounding box:

```
pad per axis = clamp(dimension / 3, 2, 12) px
```

Thresholded pixels systematically under-cover the perceptual change — anti-aliased fringes extend past them, and the recolored text inside a padded element covers a fraction of the element the reader thinks of as changed. `pixel_count` stays exact. Caller-supplied and score-map boxes are echoed exactly, without margin.

## 9. Severity

```
diff_percentage < 1%   → low
diff_percentage ≤ 10%  → medium
diff_percentage > 10%  → high
```

## 10. Spatial Position

Bbox center mapped to a 3×3 grid (image divided into thirds horizontally and vertically):

```
col = 0 if cx < w/3, 1 if cx < 2w/3, else 2
row = 0 if cy < h/3, 1 if cy < 2h/3, else 2
```

Produces: `top-left`, `top`, `top-right`, `left`, `center`, `right`, `bottom-left`, `bottom`, `bottom-right`.

## Output

Rendering-noise regions are dropped. Remaining regions are sorted by pixel count (descending) and summarized:

```
Moderate visual change detected (1.87% of image, 4 regions).
Content changed: 1 region (bottom).
Content added: 2 regions (right, bottom-left).
Content removed: 1 region (top-left).
```

## Validation

Classification accuracy is verified against real image datasets using the [blazediff-interpret-verify](../blazediff-interpret-verify/README.md) tool. Current numbers per dataset and mode live in [BENCHMARKS.md](../blazediff-interpret-verify/BENCHMARKS.md) — as of 2026-08 the three gate datasets (`addition_deletion`, `shift`, `html_color_pairs`) classify at macro F1 1.000 on known regions, and `inpaintcoco` at 0.718.
