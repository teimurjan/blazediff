# interpret-validation

Validates the blazediff interpret module against real image datasets.

## Dataset Setup

Prep scripts download datasets from HuggingFace and produce `manifest.json` files.

### InpaintCOCO (~1GB, 1,260 pairs)

Real COCO images with inpainted objects. Tests ContentChange and ColorChange.

```sh
uv run --with datasets --with Pillow scripts/prepare_inpaintcoco.py
```

### MagicBrush (~6.5GB, ~8,800 pairs)

Real COCO images edited via DALL-E 2. Tests Addition, Deletion, ColorChange, ContentChange.

```sh
uv run --with datasets --with Pillow scripts/prepare_magicbrush.py          # all
uv run --with datasets --with Pillow scripts/prepare_magicbrush.py --limit 1000  # first 1000
```

## Usage

```sh
# Basic
cargo run --release -p interpret-validation -- --manifest data/inpaintcoco/manifest.json

# With filters
cargo run --release -p interpret-validation -- \
  --manifest data/magicbrush/manifest.json \
  --min-pixels 50 \
  --iou-threshold 0.05 \
  --limit 200

# JSON output
cargo run --release -p interpret-validation -- \
  --manifest data/inpaintcoco/manifest.json \
  --output-format json
```

### CLI Flags

| Flag | Default | Description |
|---|---|---|
| `--manifest` | required | Path to dataset manifest JSON |
| `--min-pixels` | `0` | Filter predictions below this pixel count |
| `--iou-threshold` | `0.3` | IoU threshold for bbox matching |
| `--threshold` | `0.1` | Diff threshold passed to `interpret()` |
| `--limit` | `0` (all) | Max cases to run |
| `--output-format` | `text` | `text` or `json` |

## Custom Datasets

Create a `manifest.json`:

```json
{
  "base_dir": "./images",
  "type_mapping": {
    "added": "Addition",
    "removed": "Deletion"
  },
  "cases": [
    {
      "name": "case_001",
      "img1": "001_before.png",
      "img2": "001_after.png",
      "regions": [
        {
          "change_type": "added",
          "bbox": { "x": 100, "y": 200, "width": 50, "height": 80 }
        }
      ]
    }
  ]
}
```

- `base_dir`: relative to manifest file location
- `type_mapping`: maps dataset labels to `Addition`, `Deletion`, `Shift`, `ColorChange`, `ContentChange`, `RenderingNoise`
- Images: PNG or JPEG, must be same dimensions per pair
- Bounding boxes: derive from masks via `min/max` of changed pixels
