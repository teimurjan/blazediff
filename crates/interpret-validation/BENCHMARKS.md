# Interpret Classification Benchmarks

Measured with dual-image gradient comparison, color delta uniformity analysis, and expanded noise filtering.

## Addition/Deletion (904 cases from InpaintCOCO)

Real COCO photographs. Object mask regions filled with local background color to create clean before/after pairs.

| Type | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| Addition | 0.777 | 0.962 | 0.860 | 452 |
| Deletion | 0.751 | 0.976 | 0.849 | 452 |
| **Macro F1** | | | **0.854** | |

```sh
cargo run --release -p interpret-validation -- --manifest ../data/addition_deletion/manifest.json --min-pixels 50
```

## ContentChange/ColorChange (1,260 cases from InpaintCOCO)

Real COCO images with AI-inpainted objects. "object"/"size" concepts mapped to ContentChange, "color" to ColorChange.

| Type | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| ContentChange | 0.273 | 0.684 | 0.391 | 795 |
| ColorChange | 0.410 | 0.206 | 0.275 | 465 |
| **Weighted F1** | | | **0.348** | |

Low precision is expected — AI inpainting creates artifact regions beyond the annotated mask, inflating false positives.

```sh
cargo run --release -p interpret-validation -- --manifest ../data/inpaintcoco/manifest.json --min-pixels 500
```

## MagicBrush (495 cases, DALL-E 2 edits)

Stress test. DALL-E regeneration changes pixels globally — outside the module's design envelope (pixel-perfect screenshot diffs).

| Type | Precision | Recall | F1 | Support |
|---|---|---|---|---|
| ContentChange | 0.142 | 0.279 | 0.189 | 290 |
| Addition | 0.104 | 0.194 | 0.135 | 165 |
| Deletion | 0.021 | 0.138 | 0.037 | 29 |
| ColorChange | 0.019 | 0.364 | 0.037 | 11 |
| **Weighted F1** | | | **0.159** | |

```sh
cargo run --release -p interpret-validation -- --manifest ../data/magicbrush/manifest.json --min-pixels 50 --iou-threshold 0.05
```

## Notes

- **Precision is structurally low** on all datasets because the interpret module detects every pixel-level change, while ground truth only annotates the intended change. Extra predictions from compression artifacts, inpainting bleed, or AI regeneration noise are correct detections from the module's perspective.
- **Addition/Deletion** scores best because the signal is clearest: one image has content, the other has uniform background. This directly matches the module's background-blending heuristic.
- **ColorChange** is hardest to detect on these datasets because AI inpainting doesn't just change color — it regenerates texture, causing structural edge changes that push classification toward ContentChange.
- The module is designed for **visual regression testing** (screenshot/render comparisons) where unchanged regions are pixel-identical. AI-edited image datasets test a fundamentally different scenario.
