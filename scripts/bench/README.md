# scripts/bench

Refresh one section of the benchmark docs from a fresh local benchmark run, then regenerate the matching summary chart PNG. Use when you've changed code that affects performance and want the published numbers to follow.

```sh
pnpm bench <pair>
# equivalent:
node scripts/bench/run.js <pair>
```

The orchestrator (`run.js`) only knows the keys below — pass exactly one positional argument.

## Pair keys

| Key                  | Target file → section                                                                                                                    | Build prerequisite                                                                          |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `core`               | `benchmarks/pixel-by-pixel.md` → JavaScript core (no-output + with-output variants)                                                       | `pnpm --filter @blazediff/core build && pnpm --filter @blazediff/image-benchmark build`     |
| `core-wasm`          | `benchmarks/pixel-by-pixel.md` → WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`)                                                     | `pnpm build:wasm && pnpm --filter @blazediff/image-benchmark build`                         |
| `core-native`        | `benchmarks/pixel-by-pixel.md` → JavaScript Native Binary (`@blazediff/core-native` vs `odiff`)                                           | `pnpm build:rust && pnpm --filter @blazediff/image-benchmark build`                         |
| `ssim`               | `benchmarks/structural.md` → Fast Original (`@blazediff/ssim` ssim vs `ssim.js` fast)                                                     | `pnpm --filter @blazediff/ssim build && pnpm --filter @blazediff/image-benchmark build`     |
| `hitchhikers-ssim`   | `benchmarks/structural.md` → Hitchhikers SSIM (`@blazediff/ssim` hitchhikers vs `ssim.js` weber)                                          | same as `ssim`                                                                              |
| `object`             | `benchmarks/object.md` → Object (`@blazediff/object` vs `microdiff`)                                                                      | `pnpm --filter @blazediff/object build && pnpm --filter @blazediff/object-benchmark build`  |
| `python-pixelmatch`  | `benchmarks/pixel-by-pixel.md` → vs `pixelmatch` (pypi)                                                                                   | `pnpm build:python`                                                                         |
| `python-opencv`      | `benchmarks/pixel-by-pixel.md` → vs `opencv-python` (`cv2.absdiff`)                                                                       | `pnpm build:python`                                                                         |

`pairs.js` is the source of truth — every entry carries the `targetFile`, section heading, pnpm command, JSON output filename, and default iteration count.

## Variants (multi-table pairs)

Some bench TS files register two tinybench tasks per fixture (no-output + with-output buffer). Pairs that surface those as separate Markdown tables declare a `variants: [...]` array in `pairs.js`. Each variant carries:

- `section` — the heading it patches,
- `leftTaskPrefix` / `rightTaskPrefix` — the prefix before `" - "` in the tinybench task name, used to slice the shared JSON file into one variant's rows.

Currently only `core` is multi-variant. `core-wasm` shares `pixelmatch.json` with `core` but is single-variant, so its `left.taskPrefix` is set to `"pixelmatch"` to skip the with-output rows.

If a variant's `section` heading doesn't exist in the target Markdown yet, the updater inserts a placeholder section (right `###` depth, iterations line, blockquote, empty `<table>`) just after the previous variant, then overwrites those placeholders in the same pass.

## Workflow

From the repo root:

1. **Build the relevant artifacts.** Stale `dist/` silently benchmarks old code. Rebuild the side(s) you changed per the table above.
2. **Run the orchestrator:**
   ```sh
   pnpm bench <pair> [--iterations N] [--warmup N] [--skip-chart]
   ```
   `run.js` then, in order:
   1. Runs both benchmark commands with `--format=json --output=<configured path>` so they write tinybench-shaped JSON.
   2. Executes the matching `.github/workflows/scripts/compare-and-print-*.js`. For pairs without a dedicated wrapper it calls the shared `compare-and-print.js` directly — no new wrapper needed.
   3. Calls `update-benchmarks-md.js` to patch the `<table>` block, the `_<N> iterations (<M> warmup)_` line, and the `> **~X%** performance improvement on average` blockquote in `pair.targetFile`.
   4. Calls `render-chart.js` to regenerate `benchmarks/charts/<target>.png`.

## Charts

`benchmarks/charts/<target>.png` is a single PNG with **grouped horizontal bars showing total time spent** (sum of mean latencies; lower is better):

| Target            | Groups                                                                  | Bars per group |
| ----------------- | ----------------------------------------------------------------------- | -------------- |
| `pixel-by-pixel`  | JavaScript · JavaScript Native Binary · Python                          | 3 / 3 / 3      |
| `structural`      | SSIM (fast / original) · Hitchhikers SSIM (Weber)                       | 2 / 2          |
| `object`          | Plain JS object diff                                                    | 2              |
| `png-codec`       | Decode · Encode no-compression · Encode half-compression (separate generator) | 4 / 4 / 4 |

Within a group, fixture sets are **intersected** across the bars so totals are apples-to-apples. The group caption shows how many fixtures were summed (e.g. `32 fixtures, summed`).

- Output: 1600px wide, transparent PNG, voxel-art palette (orange `#ff7a1a` for BlazeDiff, gunmetal `#7a7585` for primary competitor, magenta `#ff2e8b` reserved for secondary competitor).
- **Data source**: the per-fixture ms columns of the `<table>` blocks in the target Markdown file. This is deliberate — pair JSONs share filenames (`blazediff.json` is overwritten by every right-side bench), so reading the Markdown after `update-benchmarks-md.js` has just written to it gives a consistent cross-pair view without inspecting every JSON.
- To add or rearrange bars, edit the `GROUPS` registry near the top of `render-chart.js`. Each bar is `{ name, pair, variant, series, role }`, where `series` is the 0-based index into the pair's `[left, right, ...extra]` list (column `series + 1` in the Markdown table; `side: "left"|"right"` still works as shorthand for series 0/1). `role` is `"blazediff"` (orange) · `"blazediff-next"` (cyan) · `"competitor"` (grey) · `"competitor-2"` (magenta) · `"competitor-3"` (cyan).

### Extra series (3+ implementations per group)

A pair can compare more than two implementations against its baseline (`left`) by adding an `extra: [{ name, cmd, dir, filename }, ...]` array in `pairs.js`. Each extra side becomes its own Markdown column (latency + `Saved` + `%`) and its own chart bar. `core-native` uses this to put `blazediff-next` (core-native with `BLAZEDIFF_PNG_ENABLED=1`) alongside `blazediff` and `odiff`.

`@napi-rs/canvas` is the canvas backend. It isn't a root devDependency — `render-chart.js` resolves it through the `apps/website` workspace (which already depends on it). If that workspace is ever removed, install `@napi-rs/canvas` at the repo root.

Manual chart invocation:

```sh
node scripts/bench/render-chart.js --target pixel-by-pixel
node scripts/bench/render-chart.js --target structural
node scripts/bench/render-chart.js --target object
```

## PNG codec (`png.js`)

The `blazediff-png` codec benchmark doesn't fit the pair model (it's a Rust binary comparing four codecs — blazediff / spng / image-rs / zune — for decode, encode, and output size), so it has its own orchestrator:

```sh
node scripts/bench/png.js              # cargo build + run, then regenerate
node scripts/bench/png.js --skip-run   # reuse the last JSON
node scripts/bench/png.js --json <p>   # read/write a specific JSON path
```

It runs `blazediff-png-benchmark -- --json <tmp>` (from `crates/`), then writes `benchmarks/png-codec.md` and `benchmarks/charts/png-codec.png`, reusing `drawGroupedChart` from `render-chart.js`. The Rust side gained a `--json <path>` flag for this.

Encode is measured at **two compression modes** so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly:

- **no compression** — stored deflate blocks (level 0), no row filtering;
- **half compression** — half of each codec's own max deflate level (libdeflate 12 → 6, zlib 9 → 4). zune-png only supports stored output, so its half-compression pass is the same uncompressed encode (and ~6× larger).

Each mode gets its own timing table, size table, and chart group. The actual level per codec/mode comes from the Rust binary (`codecs::level_label`) via the JSON's `encodeLevels`, so the labels never drift from what was run.

## Publishing to the website

`apps/website/scripts/generate-benchmarks.mjs` mirrors every `benchmarks/*.md` into the Nextra site as the **Benchmarks** section: it converts the `<table>` blocks to themed GFM tables, rewrites `./charts/*.png` refs to copied `/benchmark-charts/*` assets, and writes `app/benchmarks/<slug>/page.mdx` plus the section `_meta.ts` / `layout.tsx` / index redirect. It's wired into the website's `predev` and `prebuild`, so regenerating a benchmark Markdown is all it takes — the page ships on the next build. The generated `app/benchmarks/` and `public/benchmark-charts/` are gitignored; the source `benchmarks/*.md` + charts are committed.

## Things to verify before declaring done

- `git diff benchmarks/<target>.md` — only the targeted section's data rows, iteration line, and (when present) blockquote should change. If unrelated sections diff too, the `findSection()` regex in `update-benchmarks-md.js` matched the wrong section — stop and inspect.
- The benchmark JSON output paths are reused per pair (e.g. `apps/image-benchmark/blazediff.json`), so two pairs that share a side (`core` and `core-native` both write `blazediff.json`) will overwrite each other. Run pairs sequentially, not in parallel, and don't trust a stale JSON for the unrun side.

## Step-by-step fallback

If `run.js` errors out part way (e.g. `pnpm build:rust` not available on this machine), run the steps by hand from the repo root:

```sh
# 1. Per-side benchmark runs (substitute the pair's left/right commands).
pnpm benchmark:pixelmatch -- --format=json --output=apps/image-benchmark/pixelmatch.json --iterations=50
pnpm benchmark:core -- --format=json --output=apps/image-benchmark/blazediff.json --iterations=50

# 2. Compare (use the dedicated wrapper when one exists).
node .github/workflows/scripts/compare-and-print-core.js

# 3. Patch the target Markdown file.
node scripts/bench/update-benchmarks-md.js \
  --pair core \
  --left apps/image-benchmark/pixelmatch.json \
  --right apps/image-benchmark/blazediff.json \
  --iterations 50 --warmup 5

# 4. Regenerate the chart.
node scripts/bench/render-chart.js --target pixel-by-pixel
```

## Don't

- Don't update Markdown from numbers in chat — always run benchmarks and pass the resulting JSON to the updater. Hand-typed numbers go stale within a release.
- Don't run more than one pair concurrently — shared JSON output paths will clobber each other.
- Don't add new compare-and-print wrappers without being asked; the orchestrator already handles pairs without one.
