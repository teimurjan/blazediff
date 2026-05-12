# blazediff — judging ambiguous diffs

Triggered when `check --judge host` reports `pendingJudgments > 0`. The heuristic returned `ambiguous` for those entries and is deferring to you.

## Look for a mass-mask first

**Before opening any tile**, scan the slim payload's `results[]` for a recurring pattern in `verdict.headline`. If many entries share the same shape (e.g. "1 content-change @ bottom-right (0.02%, low)" across docs-react, docs-ssim, docs-jest …), they're almost certainly the same site-wide source (footer timestamp, theme-toggle, "Last updated" stamp, dynamic year). Open one or two representative tiles to confirm, then **mask once at the source** (see `MASKING.md` → "Mass-masking shared noise") instead of writing N near-identical verdicts.

Heuristics to spot a mass-mask candidate before judging:
- `pendingJudgments >= 5` with verdict headlines that look near-identical (same position, similar pixel %).
- Region tiles at the same `@ bottom-right` / `@ top-right` / `@ bottom` position across entries — that's the same layout slot rendering different per-page content.

When in doubt, open one tile from the largest group and one from the smallest; if they're the same UI element, the whole group is one mask.

## Per-entry judging

For genuinely-distinct ambiguous entries, judge per-entry. For each `<TARGET>/.blazediff/judgments/<id>/`:

> **Token discipline — read regions, not the page.** `regions.png` is a tight crop of every changed area at native resolution; `locator.png` is a ~400 px overview thumbnail. Together they're typically 10–100x smaller than the full baseline/actual/diff PNGs and contain everything needed to judge the change. **Never** open `paths.baseline` / `paths.actual` / `paths.diff` as a first move — they are full-page fallbacks for the rare case where a region clearly continues outside its crop (e.g., a layout shift that runs off the bottom of the tile). For "is something wrong with this screenshot?" investigations of any kind, default to regions first.

1. Read `request.json`. It contains `regions[]` (bbox + pixelCount + change type per region), `paths.locator`, `paths.tiles`, `heuristicVerdict`, and full `manifestEntry` context. The `paths.baseline` / `paths.actual` / `paths.diff` fields are full-page fallbacks — prefer the tiles.
2. **Batch-read `locator.png` and `regions.png` in a single tool call** (one message with two parallel Read invocations). `locator.png` is a ~400 px thumbnail of the diff with every change region outlined in red — use it for spatial orientation. `regions.png` is a vertical stack of `[baseline | actual]` pairs, one row per change region at native resolution. Row order matches the `regions[]` array (top = largest by pixelCount). When multiple pending entries exist, batch reads across entries too — every Read in one tool call.
3. Base your verdict primarily on what `regions.png` shows. Only open the full diff / baseline / actual PNGs (`paths.diff` etc., relative to the target) if the composite is itself ambiguous (e.g., a change clearly continues outside the cropped region).
   - **Dimension-change verdicts** (`headline: "image dimensions changed"`) have no `regions.png` because pixel-region analysis can't run across differently-sized images — `regions[]` will be empty. Open `paths.baseline` and `paths.actual` directly. Page-height shifts are usually intentional content edits (text added/removed, a section grew); label `intentional-likely` after confirming the content delta matches a recent commit.
4. Write `<TARGET>/.blazediff/judgments/<id>/verdict.json` (next to the request.json) with shape:
   ```json
   {
     "id": "<same id>",
     "verdict": {
       "label": "regression-likely" | "intentional-likely" | "noise-likely",
       "headline": "<one-line summary>",
       "rationale": ["<short reason>", "..."],
       "action": "investigate" | "rewrite-if-intended" | "ignore-or-rewrite"
     },
     "rationale": "<one-paragraph explanation of what you saw>",
     "confidence": 0.0
   }
   ```
   Pick `action` to match `label`: `regression-likely` → `investigate`, `intentional-likely` → `rewrite-if-intended`, `noise-likely` → `ignore-or-rewrite`.
5. Run `blazediff-agent --cwd "$TARGET" check --apply-judgments --json`. The CLI regenerates `summary.md` from your verdicts (no re-screenshot).
6. Resume the check flow with the upgraded verdicts.

## zsh-safe shell loops for fanning out ids

When you must fan out a list of ids in a `Bash` call to write verdict files, **never** rely on word-splitting on a space-delimited variable — under zsh (macOS default) it doesn't split, so `for id in $IDS` iterates once with the whole string as a single value, breaking paths like `judgments/<id>/verdict.json`. Use a heredoc + `while IFS= read -r id` instead:
```sh
TARGET="$(cd /abs/path && pwd -P)"
while IFS= read -r id; do
  [ -n "$id" ] || continue
  mkdir -p "$TARGET/.blazediff/judgments/$id"
  cat >"$TARGET/.blazediff/judgments/$id/verdict.json" <<JSON
  {"id":"$id","verdict":{"label":"noise-likely","headline":"...","rationale":["..."],"action":"ignore-or-rewrite"},"rationale":"...","confidence":0.9}
JSON
done <<'IDS'
docs
docs-bun
docs-cli
IDS
```
Never use bash-only constructs (`declare -A`, `mapfile`, `(( ))` with strings) — they fail silently under zsh.
