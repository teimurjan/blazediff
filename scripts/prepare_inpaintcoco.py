"""Download InpaintCOCO from HuggingFace and produce a manifest for interpret-validation.

Usage:
    uv run --with 'datasets Pillow' scripts/prepare_inpaintcoco.py [--limit N]
"""

import argparse
import json
import sys
from pathlib import Path

OUTPUT_DIR = Path("data/inpaintcoco")
IMAGES_DIR = OUTPUT_DIR / "images"

CONCEPT_TO_TYPE = {
    "color": "ColorChange",
    "object": "ContentChange",
    "size": "ContentChange",
}


def bbox_from_mask(mask_img) -> dict | None:
    """Extract bounding box from a PIL mask image (white = changed)."""
    import numpy as np

    arr = np.array(mask_img.convert("L"))
    ys, xs = np.where(arr > 128)
    if len(xs) == 0:
        return None
    return {
        "x": int(xs.min()),
        "y": int(ys.min()),
        "width": int(xs.max() - xs.min() + 1),
        "height": int(ys.max() - ys.min() + 1),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max samples (0=all)")
    args = parser.parse_args()

    try:
        from datasets import load_dataset
    except ImportError:
        print("Install dependencies: pip install datasets Pillow", file=sys.stderr)
        sys.exit(1)

    print("Downloading InpaintCOCO from HuggingFace...")
    ds = load_dataset("phiyodr/InpaintCOCO", split="test")

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    cases = []
    skipped = 0
    total = len(ds) if args.limit == 0 else min(args.limit, len(ds))

    for i in range(total):
        sample = ds[i]
        name = f"inpaintcoco_{i:04d}"

        coco_img = sample["coco_image"]
        inpaint_img = sample["inpaint_image"]
        mask_img = sample["mask"]
        concept = sample.get("concept", "object")

        if coco_img.size != inpaint_img.size:
            skipped += 1
            continue

        bbox = bbox_from_mask(mask_img)
        if bbox is None:
            skipped += 1
            continue

        change_type = CONCEPT_TO_TYPE.get(concept, "ContentChange")

        img1_path = f"images/{name}_coco.png"
        img2_path = f"images/{name}_inpaint.png"

        coco_img.convert("RGBA").save(OUTPUT_DIR / img1_path)
        inpaint_img.convert("RGBA").save(OUTPUT_DIR / img2_path)

        cases.append({
            "name": name,
            "img1": img1_path,
            "img2": img2_path,
            "regions": [{"change_type": change_type, "bbox": bbox}],
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

    print(f"Done: {len(cases)} cases, {skipped} skipped")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
