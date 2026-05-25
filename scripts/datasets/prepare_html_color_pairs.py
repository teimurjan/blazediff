"""Render the html_color_pairs fixtures into a gate-tier verifier dataset.

Each pair under scripts/datasets/html_color_pairs/ is one HTML page in two
versions (`page_NNN_a.html` / `page_NNN_b.html`) that differ only in Tailwind
color utility classes on 1-3 elements. Every changed element carries
`data-changed="true"` and a unique `data-region-id`. See
scripts/datasets/prompts/generate_html_color_pairs.md for the input contract.

This script renders both versions to PNGs with a deterministic headless
Chromium, derives pixel-accurate ground-truth bounding boxes from the
`[data-region-id]` elements on the `_a` document (markers are identical in
both), and emits a manifest the verifier accepts. Every region is labeled
`ColorChange`.

The verifier compares pixels, so two renders of the same baseline must be
byte-identical. Determinism comes from a fixed viewport + DPR, font/LCD
flags, an injected animation-killing stylesheet, and waiting for Tailwind to
actually apply before screenshotting.

Usage:
    playwright install chromium
    uv run --with playwright scripts/datasets/prepare_html_color_pairs.py [--limit N]
"""

import argparse
import json
import sys
from pathlib import Path

PAIRS_DIR = Path("scripts/datasets/html_color_pairs")
OUTPUT_DIR = Path("data/html_color_pairs")
IMAGES_DIR = OUTPUT_DIR / "images"

VIEWPORT = {"width": 1280, "height": 800}
MIN_BBOX_DIM = 4

LAUNCH_ARGS = [
    "--font-render-hinting=none",
    "--disable-font-subpixel-positioning",
    "--disable-lcd-text",
    "--force-color-profile=srgb",
    "--hide-scrollbars",
    "--disable-gpu",
]

NO_ANIMATION_CSS = "* { animation: none !important; transition: none !important; }"

# Floor the origin, ceil the extent — never exclude a changed edge pixel.
BBOX_JS = """() => Array.from(document.querySelectorAll('[data-region-id]')).map(el => {
  const r = el.getBoundingClientRect();
  return {
    id: el.dataset.regionId,
    x: Math.floor(r.left),
    y: Math.floor(r.top),
    width: Math.ceil(r.right - Math.floor(r.left)),
    height: Math.ceil(r.bottom - Math.floor(r.top))
  };
})"""

# Tailwind has applied once a marked element has a non-transparent, non-default
# computed background — the CDN injects styles after a tick, so poll for it.
TAILWIND_READY_JS = """() => {
  const el = document.querySelector('[data-region-id]');
  if (!el) return false;
  const bg = getComputedStyle(el).backgroundColor;
  return bg !== '' && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
}"""


def discover_pairs():
    """Return sorted (name, a_path, b_path) for every pair with both halves."""
    pairs = []
    for a_path in sorted(PAIRS_DIR.glob("page_*_a.html")):
        name = a_path.name[: -len("_a.html")]
        b_path = a_path.with_name(f"{name}_b.html")
        if b_path.exists():
            pairs.append((name, a_path, b_path))
    return pairs


def render(page, html_path, png_path):
    """Navigate, wait for Tailwind + no-animations, screenshot the viewport."""
    page.goto(html_path.resolve().as_uri(), wait_until="networkidle")
    page.add_style_tag(content=NO_ANIMATION_CSS)
    try:
        page.wait_for_function(TAILWIND_READY_JS, timeout=10_000)
    except Exception:
        # Page may legitimately have no colored background on its first marked
        # element; fall through and let the caller validate bboxes instead.
        pass
    page.screenshot(path=str(png_path), full_page=False)


def extract_regions(page):
    """Read GT bboxes from the `_a` page; drop collapsed/off-viewport ones."""
    raw = page.evaluate(BBOX_JS)
    regions = []
    for r in raw:
        x, y, w, h = r["x"], r["y"], r["width"], r["height"]
        if w < MIN_BBOX_DIM or h < MIN_BBOX_DIM:
            print(f"    drop region {r['id']}: collapsed bbox {w}x{h}")
            continue
        if x < 0 or y < 0 or x + w > VIEWPORT["width"] or y + h > VIEWPORT["height"]:
            print(f"    drop region {r['id']}: outside viewport ({x},{y},{w},{h})")
            continue
        regions.append({
            "id": r["id"],
            "change_type": "ColorChange",
            "bbox": {"x": int(x), "y": int(y), "width": int(w), "height": int(h)},
        })
    return regions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="Max pairs (0=all)")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Install: uv run --with playwright ... (then `playwright install chromium`)", file=sys.stderr)
        sys.exit(1)

    pairs = discover_pairs()
    if args.limit:
        pairs = pairs[: args.limit]
    if not pairs:
        print(f"No page_*_a/_b.html pairs under {PAIRS_DIR}", file=sys.stderr)
        sys.exit(1)

    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    cases = []
    skipped_no_regions = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=LAUNCH_ARGS)
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=1)

        for name, a_path, b_path in pairs:
            a_png = IMAGES_DIR / f"{name}_a.png"
            b_png = IMAGES_DIR / f"{name}_b.png"

            render(page, a_path, a_png)
            regions = extract_regions(page)  # markers identical in both halves
            render(page, b_path, b_png)

            if not regions:
                print(f"  skip {name}: no usable regions")
                skipped_no_regions += 1
                continue

            cases.append({
                "name": name,
                "img1": f"images/{name}_a.png",
                "img2": f"images/{name}_b.png",
                "regions": regions,
            })

        browser.close()

    manifest = {
        "base_dir": ".",
        "default_tier": "gate",
        "type_mapping": {},
        "cases": cases,
    }
    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2))

    total_regions = sum(len(c["regions"]) for c in cases)
    print(
        f"Done: {len(cases)} cases, {total_regions} ColorChange regions "
        f"(skipped: {skipped_no_regions} no-region)"
    )
    print(f"Manifest: {manifest_path}")


if __name__ == "__main__":
    main()
