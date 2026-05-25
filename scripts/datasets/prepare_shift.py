"""Generate Shift test pairs from InpaintCOCO base images.

For each source photograph, picks 1-3 rectangular sub-regions and translates
each to a new non-overlapping location. The vacated original location is
filled with sampled local background. Produces pixel-perfect ground truth for
Shift classification.

Per shift, emits two manifest entries linked by `pair_id` so the verifier's
shift-pair scoring (see crates/blazediff-interpret-verify/src/runner.rs:268-308)
can match them:
  - Original location: change_type=Deletion, expected_change_type=Shift
  - Translated location: change_type=Addition, expected_change_type=Shift

The shift distance is always > region size to keep before/after non-overlapping,
which is the regime the Shift post-pass in interpret/shifts.rs is designed for.

Usage:
    uv run --with 'datasets Pillow numpy' scripts/datasets/prepare_shift.py [--limit N]
"""

import argparse
import json
import random
import sys
from pathlib import Path

OUTPUT_DIR = Path("data/shift")
IMAGES_DIR = OUTPUT_DIR / "images"

REGION_SIZES = [40, 90, 160]
MAX_REGIONS_PER_IMAGE = 3
EDGE_PADDING = 8
MIN_IMAGE_DIM = 320
DIRECTIONS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]
SHIFT_FACTOR_RANGE = (1.3, 3.0)
# Reject source patches whose max per-channel std-dev is below this:
# a uniform-background patch shifted to another uniform region is a no-op,
# not a meaningful shift to validate against.
MIN_CONTENT_STD = 12.0


def rect_overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)


def has_content(img_arr, bbox, min_std=MIN_CONTENT_STD):
    import numpy as np

    x, y, w, h = bbox
    patch = img_arr[y : y + h, x : x + w, :3]
    return float(patch.reshape(-1, 3).std(axis=0).max()) >= min_std


def pick_shift_placements(rng, img_arr, max_count=MAX_REGIONS_PER_IMAGE):
    """Return a list of (before_bbox, after_bbox) tuples that all mutually do not overlap."""
    img_h, img_w = img_arr.shape[:2]
    placed = []
    target = rng.randint(1, max_count)
    for _ in range(60):
        if len(placed) >= target:
            break
        size = rng.choice(REGION_SIZES)
        if size + 2 * EDGE_PADDING >= min(img_h, img_w):
            continue
        x = rng.randint(EDGE_PADDING, img_w - size - EDGE_PADDING)
        y = rng.randint(EDGE_PADDING, img_h - size - EDGE_PADDING)
        before = (x, y, size, size)

        if not has_content(img_arr, before):
            continue

        shift_dist = int(size * rng.uniform(*SHIFT_FACTOR_RANGE))
        dx, dy = rng.choice(DIRECTIONS)
        nx = x + dx * shift_dist
        ny = y + dy * shift_dist
        if nx < EDGE_PADDING or nx + size > img_w - EDGE_PADDING:
            continue
        if ny < EDGE_PADDING or ny + size > img_h - EDGE_PADDING:
            continue
        after = (nx, ny, size, size)
        if rect_overlap(before, after):
            continue
        if any(
            rect_overlap(before, b) or rect_overlap(before, a)
            or rect_overlap(after, b) or rect_overlap(after, a)
            for b, a in placed
        ):
            continue
        placed.append((before, after))
    return placed


def apply_shifts(img_arr, placements):
    """Apply all shifts to a copy of img_arr.

    For each (before, after):
      1. Sample background color from a border ring around `before` (excluding
         `before` itself and any other placement rectangles).
      2. Copy pixels from `before` to `after`.
      3. Fill `before` with the sampled background color.

    Order: paste-then-fill, applied placement-by-placement against the original
    pixel buffer (so one shift cannot corrupt another's source content).
    """
    import numpy as np

    result = img_arr.copy()
    src = img_arr
    h, w = src.shape[:2]
    pad = 12

    all_rects = [r for pair in placements for r in pair]

    for before, after in placements:
        bx, by, bw, bh = before
        ax, ay, aw, ah = after

        by0, by1 = max(0, by - pad), min(h, by + bh + pad)
        bx0, bx1 = max(0, bx - pad), min(w, bx + bw + pad)
        border = src[by0:by1, bx0:bx1]
        excl = np.zeros(border.shape[:2], dtype=bool)
        for rx, ry, rw, rh in all_rects:
            ex0 = max(0, rx - bx0)
            ey0 = max(0, ry - by0)
            ex1 = min(border.shape[1], rx + rw - bx0)
            ey1 = min(border.shape[0], ry + rh - by0)
            if ex1 > ex0 and ey1 > ey0:
                excl[ey0:ey1, ex0:ex1] = True
        bg_pixels = border[~excl]
        if len(bg_pixels) == 0:
            return None
        bg_color = bg_pixels.mean(axis=0).astype(src.dtype)

        result[ay : ay + ah, ax : ax + aw] = src[by : by + bh, bx : bx + bw]
        result[by : by + bh, bx : bx + bw] = bg_color

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max samples (0=all)")
    parser.add_argument("--seed", type=int, default=42, help="Base RNG seed")
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
    skipped_small = 0
    skipped_no_placement = 0
    skipped_fill = 0
    total = len(ds) if args.limit == 0 else min(args.limit, len(ds))

    for i in range(total):
        sample = ds[i]
        coco_img = sample["coco_image"].convert("RGBA")
        img_arr = np.array(coco_img)
        h, w = img_arr.shape[:2]

        if min(h, w) < MIN_IMAGE_DIM:
            skipped_small += 1
            continue

        rng = random.Random(args.seed + i)
        placements = pick_shift_placements(rng, img_arr)
        if not placements:
            skipped_no_placement += 1
            continue

        shifted_arr = apply_shifts(img_arr, placements)
        if shifted_arr is None:
            skipped_fill += 1
            continue
        shifted_img = Image.fromarray(shifted_arr)

        name = f"shift_{i:04d}"
        a_path = f"images/{name}_a.png"
        b_path = f"images/{name}_b.png"
        coco_img.save(OUTPUT_DIR / a_path)
        shifted_img.save(OUTPUT_DIR / b_path)

        regions = []
        for k, (before, after) in enumerate(placements):
            bx, by, bw, bh = before
            ax, ay, aw, ah = after
            pair_id = f"{name}_pair_{k}"
            regions.append({
                "change_type": "Deletion",
                "expected_change_type": "Shift",
                "pair_id": pair_id,
                "bbox": {"x": int(bx), "y": int(by), "width": int(bw), "height": int(bh)},
            })
            regions.append({
                "change_type": "Addition",
                "expected_change_type": "Shift",
                "pair_id": pair_id,
                "bbox": {"x": int(ax), "y": int(ay), "width": int(aw), "height": int(ah)},
            })

        cases.append({
            "name": name,
            "img1": a_path,
            "img2": b_path,
            "regions": regions,
        })

        if (i + 1) % 100 == 0:
            print(f"  Processed {i + 1}/{total}")

    manifest = {
        "base_dir": ".",
        "default_tier": "gate",
        "type_mapping": {},
        "cases": cases,
    }

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    total_shifts = sum(len(c["regions"]) // 2 for c in cases)
    print(
        f"Done: {len(cases)} cases, {total_shifts} shift events "
        f"(skipped: {skipped_small} too-small images, "
        f"{skipped_no_placement} no-placement, {skipped_fill} fill-failed)"
    )
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
