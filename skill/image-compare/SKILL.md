---
name: image-compare
description: Compare two image files on disk and report what changed, region by region. Trigger on "what changed between these two images", "diff these PNGs", "did this render drift", "compare screenshots/exports/renders".
---

# image-compare

Two image files in, a verdict out. No baselines, no manifest, no browser.

CLI binary is `blazediff-cli` (`npm i -g @blazediff/cli`).

**Not this skill:** capturing a running app, managing baselines, or re-running a
visual regression suite → use the `blazediff` skill instead (it owns
`.blazediff/`, `blazediff-agent`, and the check/rewrite loop). If the working
directory has a `.blazediff/manifest.json` and the user is asking about *routes*
rather than *files*, you are in the wrong skill.

## Be terse
- Pass `--json` on every call; parse fields. Do not echo CLI output.
- Never send whole images to a model when `interpret` has located the regions —
  see **Send crops, not pages** below. This is the point of the skill.
- One final summary line: `N regions | <severity> | <one-clause verdict>`.

## Pick the command by the question

| The user is asking | Command | Read from it |
|---|---|---|
| "what changed?" / "describe the differences" | `interpret` | `regions[]` — bbox, changeType, position |
| "are these identical?" | `core-native` | `different pixels` (0 = byte-identical after decode) |
| "how different, perceptually?" | `ssim` | SSIM score, 1.0 = identical |
| "did quality degrade?" (compression, resize, generative output) | `msssim` | multi-scale score, 1.0 = identical |
| "where are the structural differences?" | `gmsd -o map.png` | deviation, **0.0 = identical** |

`interpret` is the default. The others answer *how much*; only `interpret`
answers *what*.

```
blazediff-cli interpret a.png b.png --json
```

Exit codes: `0` no regions, `1` regions found, `2` error. Safe to branch on.

### Picking `--source`
- `pixel` (default) — pixel-aligned renders: screenshots, PNG exports, chart
  renders, PDF rasterizations. Anything produced twice by the same renderer.
- `ms-ssim` / `ssim` — images with resampling or compression noise: JPEGs,
  camera captures, generative-model output, anything that went through a
  lossy round-trip. Per-pixel deltas are everywhere in these, so `pixel`
  returns one giant region; the metric sources threshold a similarity map
  instead. Their boxes are coarser (map-grid resolution), but the pixel counts
  inside them are still exact.

Add `-a` when the pair is text-heavy and the only differences are antialiasing
fringes. Raise `-t` (default 0.1) when the renderer has known per-run jitter.

## Reading the result

```jsonc
{
  "summary": "Moderate visual change detected (1.87% of image, 4 regions).",
  "severity": "medium",           // low | medium | high
  "diffCount": 30421,             // changed pixels
  "diffPercentage": 1.87,
  "totalRegions": 4,
  "width": 1328, "height": 1228,
  "regions": [{ "bbox": {...}, "changeType": "...", "position": "...", "shape": "...",
                "pixelCount": 0, "percentage": 0, "confidence": 0 /* + stats blocks */ }]
}
```

`changeType` — `addition`, `deletion`, `content-change`, `color-change`,
`shift`, `rendering-noise`.
`position` — `top-left`…`bottom-right`, `top`/`bottom`/`left`/`right`/`center`.
`shape` — `solid-region`, `mixed-region`, `contour-frame`, `sparse-distributed`,
`edge-dominated`.

Each region also carries `chroma`, `colorDelta`, `gradient`, `shapeStats`, and
`signals` blocks. **Do not put these in your context or forward them to a
model** — they are classifier inputs, not answers. Project each region down to
`{changeType, position, bbox, percentage}` before you reason about it. The full
JSON for a 4-region diff is ~7.5 KB; the projection is ~200 tokens.

Interpreting `changeType`:
- `rendering-noise` — subpixel/antialiasing jitter. Report as "no meaningful
  change" unless the user is specifically hunting rendering differences.
- `color-change` with `signals.lowColorDelta` and `gradient.edgeCorrelation`
  near 1.0 — same content, recoloured. Theme change, not content change.
- `shift` — content moved, not edited. Say what moved and by roughly how much;
  don't describe it as added and removed.
- `addition` / `deletion` / `content-change` — genuine content differences.
  These are the ones worth cropping and reading.

## Send crops, not pages

When the user wants each change *described* (not just located), crop the
regions and send only those. Never send the two full images.

Two reasons, and the second matters more than the first:

1. **Cost.** A pair of full-page screenshots is thousands of visual tokens, and
   nearly all of them show pixels that are identical in both images.
2. **Legibility.** Claude downscales any image that exceeds the model's limits.
   A full-page screenshot gets crushed by ~6×, which destroys the exact detail
   you are trying to compare — and images over 8000 px on an edge are rejected
   outright.

Measured on this repo's fixtures (Claude Opus 5, high-resolution tier:
2576 px max edge, 4784 max visual tokens; cost is `⌈w/28⌉ × ⌈h/28⌉` per image):

| | **A**: `fixtures/page` — 3598×16384 page, 2 regions, 0.09% px | **B**: `fixtures/blazediff/3` — 1328×1228, 4 regions, 1.87% px |
|---|---|---|
| Both full images, as-is | **rejected** — 16384 px exceeds the 8000 px limit | 2112 ×2 = **4224** tokens |
| Both pre-resized to fit | 566×2576 → 1932 ×2 = **3864** tokens — but the 711×104 changed region is now **112×16 px**, and the 212×42 one is **33×7 px**. Unreadable. | n/a, already fits |
| Crops + projected region JSON | 408 + ~128 = **536** | 1178 + ~206 = **1384** |
| | **7.2× cheaper, at native resolution** | **3.1× cheaper (−67%)** |

The saving scales with how little of the image changed, which for real diffs is
almost always "very little". Case A changed 0.09% of its pixels; sending both
pages would have spent ~99.9% of the budget on identical content.

### The crop step

Pad each bbox by 32 px so the change has surrounding context, clamp to the image
bounds, and crop the **same box from both images** — the pair only reads as a
before/after if the framing is identical.

```bash
# one region, both sides. x/y/w/h come from regions[i].bbox, padded and clamped.
node -e '
const sharp = require("sharp"), [src, out, x, y, w, h] = process.argv.slice(1);
sharp(src).extract({left:+x, top:+y, width:+w, height:+h}).toFile(out);
' "$SRC" "$OUT" "$X" "$Y" "$W" "$H"
```

`sharp` ships with `@blazediff/cli` via `@blazediff/codec-sharp`. If it does not
resolve (global install, no local `node_modules`), fall back to `sips -c` on
macOS or `magick crop` where ImageMagick is present.

Then send, per region, in one message: the region's projected JSON, its before
crop, its after crop. Label them — `Region 1 (content-change, bottom): before /
after` — so follow-up questions can name a region without resending anything.

### When not to crop

Send the full (resized) pair instead when any of these hold:

- `totalRegions` is 0 — nothing to crop; answer from the metric score.
- The regions cover most of the frame (`diffPercentage` above ~25%, or one
  region spanning most of the bbox area). A full-frame rewrite is best read
  whole.
- Summed crop tokens exceed the full-pair cost. With many small scattered
  regions, per-crop 28-px padding overhead adds up — compute both, pick the
  smaller.
- The question is about *layout* or *global composition* rather than local
  content. Crops destroy spatial relationships between regions.

## Answering

Lead with the verdict, then the regions, in the user's terms:

```
4 regions changed (medium).
1. content-change, bottom (590×479 at 356,651) — <what the crops show>
2. addition, right (95×154 at 992,614) — <what the crops show>
...
```

If every region is `rendering-noise`, say the images are visually equivalent and
give the SSIM score as backing. Don't manufacture a difference to report.

## Failure modes

- **Different dimensions** — `interpret` requires matching sizes. Say so and
  ask whether to resize or compare a common crop; don't silently resize, since
  that changes what "different" means.
- **`pixel` returns one region covering everything** — the pair has resampling
  or compression noise. Re-run with `--source ms-ssim`.
- **Huge `diffCount` but the images look the same** — check for an alpha or
  colour-profile difference; compare with `ssim` (structure-only) to confirm.
- **`gmsd` output labels are inverted** — the CLI prints
  `(0=different, 1=identical)` and a `similarity: N%` line, but GMSD is a
  *deviation*: identical images score `0.000000`. Read the number as distance,
  and ignore the printed label.
