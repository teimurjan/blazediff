# blazediff-interpret-verify

Verification harness for `blazediff::interpret` with two explicit tracks:

- `classifier-only`: grade `change_type` on known ground-truth regions. This is the primary iteration gate for classifier work.
- `end-to-end`: run full `interpret()` region discovery plus class-aware matching. This is a secondary product-behavior benchmark.

## Usage

```sh
# From crates/
cargo run -p blazediff-interpret-verify -- \
  --manifest ../data/addition_deletion/manifest.json \
  --mode classifier-only \
  --macro-f1-floor 0.90 \
  --class-f1-floor Addition=0.90 \
  --class-f1-floor Deletion=0.90

cargo run -p blazediff-interpret-verify -- \
  --manifest ../data/addition_deletion/manifest.json \
  --mode end-to-end \
  --min-pixels 50 \
  --output-format json
```

## CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--manifest` | required | Path to dataset manifest JSON |
| `--mode` | `classifier-only` | `classifier-only` or `end-to-end` |
| `--output-format` | `text` | `text` or `json` |
| `--limit` | `0` | Max cases to run |
| `--macro-f1-floor` | unset | Hard macro F1 floor |
| `--class-f1-floor` | unset | Repeatable `Label=score` class floors |
| `--baseline-report` | unset | Prior JSON report for delta checks |
| `--max-macro-f1-drop` | unset | Allowed macro F1 regression versus baseline |
| `--max-class-f1-drop` | unset | Repeatable `Label=score` class-drop tolerances |
| `--iou-threshold` | `0.3` | End-to-end matching threshold |
| `--threshold` | `0.1` | Diff threshold passed to `interpret()` in end-to-end mode |
| `--min-pixels` | `0` | End-to-end minimum predicted region size |

## Manifest Format

Each case can carry tier metadata and one or more labeled regions. Each region can be bbox-backed, mask-backed, or both.

```json
{
  "base_dir": ".",
  "default_tier": "gate",
  "cases": [
    {
      "name": "shift_fixture",
      "img1": "images/before.png",
      "img2": "images/after.png",
      "tier": "gate",
      "tags": ["paired-shift"],
      "regions": [
        {
          "id": "old-position",
          "change_type": "Deletion",
          "expected_change_type": "Shift",
          "bbox": { "x": 10, "y": 20, "width": 20, "height": 20 },
          "pair_id": "shift-1"
        },
        {
          "id": "new-position",
          "change_type": "Addition",
          "expected_change_type": "Shift",
          "mask_path": "masks/new-position.png",
          "pair_id": "shift-1"
        },
        {
          "id": "text-aa",
          "change_type": "RenderingNoise",
          "expected_change_type": "RenderingNoise",
          "mask_path": "masks/text-aa.png",
          "expect_in_output": false,
          "tags": ["tiny", "noise"]
        }
      ]
    }
  ]
}
```

### Fields

- `default_tier`, `tier`: `gate`, `regression`, or `stress`
- `change_type`: source label from the dataset
- `expected_change_type`: final label the verifier should score. This is how paired `Addition` and `Deletion` regions can be graded as `Shift`
- `bbox`: region bounds
- `mask_path`: optional full-image binary mask. If `bbox` is omitted, the verifier derives it from the mask
- `pair_id`: optional grouping key for shift-style paired regions
- `expect_in_output`: set `false` for regions such as `RenderingNoise` that should be filtered from final `interpret()` output in `end-to-end` mode
- `tags`: free-form case or region tags for failure analysis

## Reporting

Both modes emit:

- macro F1 and weighted F1
- per-class precision, recall, and F1
- confusion matrix
- worst confusion pairs
- detection misses, detection extras, and wrong-class counts
- failure details with case id, tier, region id, labels, tags, IoU, and classifier signals
- optional baseline deltas and gate pass/fail status

## Dataset Positioning

- Controlled fixture manifests should use `tier: gate` and be the main classifier tuning gate.
- Real labeled datasets such as `inpaintcoco` fit best as `regression`.
- `html_color_pairs` is a `gate` corpus of 100 rendered Tailwind UI screenshot pairs that differ only in color classes, giving label-perfect `ColorChange` regions to pin down the `ColorChange` vs `ContentChange` boundary.

## Generating datasets

All datasets are produced from prep scripts under `scripts/datasets/`.
Outputs land in `data/<name>/` and are git-ignored.

```sh
# Run from repo root
uv run --with datasets --with Pillow --with numpy scripts/datasets/prepare_addition_deletion.py
uv run --with datasets --with Pillow --with numpy scripts/datasets/prepare_inpaintcoco.py
uv run --with datasets --with Pillow --with numpy scripts/datasets/prepare_shift.py

# html_color_pairs renders local HTML fixtures with headless Chromium.
# One-time browser install, then run the renderer:
uv run --with playwright playwright install chromium
uv run --with playwright scripts/datasets/prepare_html_color_pairs.py
```

`prepare_shift.py` synthesises shift pairs from InpaintCOCO photos: for each
source image it picks 1–3 sub-regions, translates each by 1.3–3× its size in a
random direction, fills the vacated location with locally sampled background,
and emits two manifest entries per shift (Deletion + Addition, both
`expected_change_type: Shift`, linked by `pair_id`). This is the only
ground-truth corpus for the `Shift` change type.
