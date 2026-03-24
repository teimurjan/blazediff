"""Generate Addition/Deletion test pairs from InpaintCOCO.

Takes real COCO photographs and creates clean pairs where one image has an
object and the other has that region filled with local background color.
This produces pixel-perfect ground truth for Addition/Deletion classification.

For each "object" sample in InpaintCOCO:
  - Computes average background color from pixels surrounding the mask
  - Creates a "clean" image by filling the mask region with that background
  - Emits two cases:
    - (clean, original) → Addition (object appears in img2)
    - (original, clean) → Deletion (object disappears in img2)

Usage:
    uv run --with 'datasets Pillow numpy' scripts/prepare_addition_deletion.py [--limit N]
"""

import argparse
import json
import sys
from pathlib import Path

OUTPUT_DIR = Path("data/addition_deletion")
IMAGES_DIR = OUTPUT_DIR / "images"


def bbox_from_mask(mask_arr):
    """Extract bounding box from a numpy mask array."""
    ys, xs = mask_arr.nonzero()
    if len(xs) == 0:
        return None
    return {
        "x": int(xs.min()),
        "y": int(ys.min()),
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
    }


def fill_mask_with_background(img_arr, mask_arr, border_px=10):
    """Fill masked region with average color of surrounding non-masked pixels.

    Samples a border ring around the mask bounding box to compute background.
    Falls back to the image-wide non-masked average if the border has no pixels.
    """
    import numpy as np

    ys, xs = mask_arr.nonzero()
    if len(xs) == 0:
        return img_arr

    x_min, x_max = int(xs.min()), int(xs.max())
    y_min, y_max = int(ys.min()), int(ys.max())
    h, w = img_arr.shape[:2]

    # Sample border ring around mask bbox
    bx0 = max(0, x_min - border_px)
    by0 = max(0, y_min - border_px)
    bx1 = min(w, x_max + border_px + 1)
    by1 = min(h, y_max + border_px + 1)

    border_region = img_arr[by0:by1, bx0:bx1]
    border_mask = mask_arr[by0:by1, bx0:bx1]
    bg_pixels = border_region[~border_mask]

    if len(bg_pixels) == 0:
        # Fallback: use all non-masked pixels
        bg_pixels = img_arr[~mask_arr]

    if len(bg_pixels) == 0:
        return img_arr

    bg_color = bg_pixels.mean(axis=0).astype(img_arr.dtype)

    result = img_arr.copy()
    result[mask_arr] = bg_color
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max samples (0=all)")
    args = parser.parse_args()

    try:
        import numpy as np
        from datasets import load_dataset
        from PIL import Image
    except ImportError:
        print("Install: pip install datasets Pillow numpy", file=sys.stderr)
        sys.exit(1)

    print("Downloading InpaintCOCO from HuggingFace...")
    ds = load_dataset("phiyodr/InpaintCOCO", split="test")

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    cases = []
    skipped = 0
    total = len(ds) if args.limit == 0 else min(args.limit, len(ds))

    for i in range(total):
        sample = ds[i]
        concept = sample.get("concept", "object")

        # Only use "object" concept — these have clear foreground objects
        if concept != "object":
            continue

        coco_img = sample["coco_image"].convert("RGBA")
        mask_img = sample["mask"].convert("L")

        img_arr = np.array(coco_img)
        mask_arr = np.array(mask_img) > 128

        bbox = bbox_from_mask(mask_arr)
        if bbox is None:
            skipped += 1
            continue

        # Skip tiny masks (< 100px) — too small for meaningful classification
        if bbox["width"] * bbox["height"] < 100:
            skipped += 1
            continue

        clean_arr = fill_mask_with_background(img_arr, mask_arr)
        clean_img = Image.fromarray(clean_arr)

        name = f"adddel_{i:04d}"
        original_path = f"images/{name}_original.png"
        clean_path = f"images/{name}_clean.png"

        coco_img.save(OUTPUT_DIR / original_path)
        clean_img.save(OUTPUT_DIR / clean_path)

        # Addition: clean → original (object appears)
        cases.append({
            "name": f"{name}_addition",
            "img1": clean_path,
            "img2": original_path,
            "regions": [{"change_type": "Addition", "bbox": bbox}],
        })

        # Deletion: original → clean (object disappears)
        cases.append({
            "name": f"{name}_deletion",
            "img1": original_path,
            "img2": clean_path,
            "regions": [{"change_type": "Deletion", "bbox": bbox}],
        })

        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{total}")

    manifest = {
        "base_dir": ".",
        "type_mapping": {},
        "cases": cases,
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    addition_count = sum(1 for c in cases if c["regions"][0]["change_type"] == "Addition")
    deletion_count = sum(1 for c in cases if c["regions"][0]["change_type"] == "Deletion")

    print(f"Done: {len(cases)} cases ({addition_count} Addition, {deletion_count} Deletion), {skipped} skipped")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
