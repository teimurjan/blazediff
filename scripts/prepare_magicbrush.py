"""Download MagicBrush from HuggingFace and produce a manifest for interpret-validation.

Usage:
    uv run --with 'datasets Pillow' scripts/prepare_magicbrush.py [--limit N] [--split train]
"""

import argparse
import json
import sys
from pathlib import Path

OUTPUT_DIR = Path("data/magicbrush")
IMAGES_DIR = OUTPUT_DIR / "images"

COLORS = [
    "red", "blue", "green", "yellow", "white", "black", "pink",
    "orange", "purple", "brown", "gray", "grey", "golden", "silver",
]

ADD_KEYWORDS = ["add ", "put ", "place ", "insert ", "draw "]
REMOVE_KEYWORDS = ["remove", "erase", "delete", "take away", "get rid", "take out"]
COLOR_KEYWORDS = ["change color", "change the color", "make it ", "turn it ", "make the ", "paint "]


def classify_instruction(text: str) -> str:
    t = text.lower()
    for kw in ADD_KEYWORDS:
        if kw in t:
            return "Addition"
    for kw in REMOVE_KEYWORDS:
        if kw in t:
            return "Deletion"
    for kw in COLOR_KEYWORDS:
        if kw in t and any(c in t for c in COLORS):
            return "ColorChange"
    return "ContentChange"


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
    parser.add_argument("--split", default="train", help="Dataset split (train/dev)")
    args = parser.parse_args()

    try:
        from datasets import load_dataset
    except ImportError:
        print("Install dependencies: pip install datasets Pillow", file=sys.stderr)
        sys.exit(1)

    print(f"Downloading MagicBrush ({args.split}) from HuggingFace...")
    ds = load_dataset("osunlp/MagicBrush", split=args.split)

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    cases = []
    skipped = 0
    type_counts = {}
    total = len(ds) if args.limit == 0 else min(args.limit, len(ds))

    for i in range(total):
        sample = ds[i]
        img_id = sample.get("img_id", str(i))
        turn = sample.get("turn_index", 0)
        name = f"magicbrush_{img_id}_t{turn}"

        source_img = sample["source_img"]
        target_img = sample["target_img"]
        mask_img = sample["mask_img"]
        instruction = sample.get("instruction", "")

        if source_img.size != target_img.size:
            skipped += 1
            continue

        bbox = bbox_from_mask(mask_img)
        if bbox is None:
            skipped += 1
            continue

        change_type = classify_instruction(instruction)
        type_counts[change_type] = type_counts.get(change_type, 0) + 1

        img1_path = f"images/{name}_source.png"
        img2_path = f"images/{name}_target.png"

        source_img.convert("RGBA").save(OUTPUT_DIR / img1_path)
        target_img.convert("RGBA").save(OUTPUT_DIR / img2_path)

        cases.append({
            "name": name,
            "img1": img1_path,
            "img2": img2_path,
            "regions": [{"change_type": change_type, "bbox": bbox}],
        })

        if (i + 1) % 500 == 0:
            print(f"  Processed {i + 1}/{total}")

    manifest = {
        "base_dir": ".",
        "type_mapping": {},
        "cases": cases,
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    print(f"Done: {len(cases)} cases, {skipped} skipped")
    print(f"Type distribution: {json.dumps(type_counts, indent=2)}")
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
