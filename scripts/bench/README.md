# scripts/bench

Run one benchmark, store its results as a committed artifact, and refresh the matching benchmark docs. Use it after you change code that affects performance.

```sh
pnpm benchmark <bench>
# equivalent:
node scripts/bench/run.js <bench>
```

`run.js` is the only entry point for every benchmark. Pass exactly one positional argument: a pair key or a standalone key from the tables below. Flags take `--flag value` or `--flag=value`.

The root `package.json` has no per-library aliases. Each side's `cmd` in `pairs.js` calls its app directly, for example `pnpm --filter @blazediff/image-benchmark core`. Runners that no pair uses (`core-native-buffer`, `gmsd`, `opentf-obj-diff`) run the same way, for example `pnpm --filter @blazediff/image-benchmark gmsd`.

## Artifacts

Every run writes `benchmarks/results/<key>.json` (built by `artifact.js`). This file is the single source of the numbers:

- `update-benchmarks-md.js` and `png.js` build the Markdown tables in `benchmarks/*.md` from it.
- The website reads all artifacts at build time (`apps/website/scripts/generate-benchmarks.mjs`) for the `/benchmarks` page and the homepage teaser and speed claims.
- The benchmark workflows in `.github/workflows/benchmark-*.yml` upload the same files as GitHub Actions artifacts.

Commit the artifact together with the Markdown it produced. The shape is (schemaVersion 1):

```ts
{
  schemaVersion: 1,
  key: string,                 // "core-native"
  category: string,            // "pixel-by-pixel" | "structural" | "object" | "png-codec"
  generatedAt: string,         // ISO date
  commit: { sha, dirty },      // dirty ignores changes under benchmarks/
  env: { platform, arch, osRelease, cpu, cores, memoryGb, node, rustc?, python? },
  config: { iterations?, warmup?, method?, ioIncluded },
  sections: [{
    id, title, unit: "ms" | "bytes", stat: "mean" | "best" | "size", note?,
    series: [{ id, name, version?, iterations?, baseline, ours }],
    rows: [{ fixture, mpx?, values: { [seriesId]: { value, min?, max? } | null } }],
  }],
}
```

The series with `baseline: true` is the reference that the other series are compared against. Pair benches always list it first. `version` comes from the side's `package` (npm) or `pythonPackage` (PyPI) field in `pairs.js`. If you change the shape, increase `schemaVersion` in `artifact.js`, in `generate-benchmarks.mjs` and in the website's `components/benchmarks/artifacts.ts`.

## Pair keys

| Key                 | Target file and section                                                                       | Build prerequisite                                                                         |
| ------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `core`              | `benchmarks/pixel-by-pixel.md`: JavaScript core (no-output and with-output variants)          | `pnpm --filter @blazediff/core build && pnpm --filter @blazediff/image-benchmark build`    |
| `core-wasm`         | `benchmarks/pixel-by-pixel.md`: WebAssembly (`@blazediff/core-wasm` vs `pixelmatch`)          | `pnpm build:wasm && pnpm --filter @blazediff/image-benchmark build`                        |
| `core-native`       | `benchmarks/pixel-by-pixel.md`: JavaScript Native Binary (`@blazediff/core-native` vs `odiff`) | `pnpm build:rust && pnpm --filter @blazediff/image-benchmark build`                        |
| `honeydiff`         | `benchmarks/pixel-by-pixel.md`: JavaScript Native Binary (`@blazediff/core-native` vs `honeydiff`) | same as `core-native`                                                                 |
| `ssim`              | `benchmarks/structural.md`: Fast Original (`@blazediff/ssim` ssim vs `ssim.js` fast)          | `pnpm --filter @blazediff/ssim build && pnpm --filter @blazediff/image-benchmark build`    |
| `hitchhikers-ssim`  | `benchmarks/structural.md`: Hitchhikers SSIM (`@blazediff/ssim` hitchhikers vs `ssim.js` weber) | same as `ssim`                                                                           |
| `object`            | `benchmarks/object.md`: Object (`@blazediff/object` vs `microdiff`)                           | `pnpm --filter @blazediff/object build && pnpm --filter @blazediff/object-benchmark build` |
| `python-pixelmatch` | `benchmarks/pixel-by-pixel.md`: vs `pixelmatch` (pypi)                                        | `pnpm build:python`                                                                        |
| `python-opencv`     | `benchmarks/pixel-by-pixel.md`: vs `opencv-python` (`cv2.absdiff`)                            | `pnpm build:python`                                                                        |

`pairs.js` is the source of truth. Every entry carries the `targetFile`, the section heading, the pnpm command, the JSON output filename, `ioIncluded`, and the default iteration count.

`honeydiff` measures `@vizzly-testing/honeydiff` (the npm addon, the only public build) against `@blazediff/core-native`. Both run at their defaults with antialiasing on and write a diff PNG. honeydiff thresholds on CIEDE2000 ΔE and BlazeDiff on YIQ, so the pair compares speed, not identical output. honeydiff ships binaries for darwin-arm64, linux-x64/arm64 (glibc) and win-x64 only.

## Standalone keys

Some benches do not fit the left/right pair model. They own their whole pipeline (run, artifact, Markdown). `pairs.js` registers them under `STANDALONE` as `key → module`, and `run.js` sends `pnpm benchmark <key>` to that module's `run(flags)`.

| Key          | Writes                                          | Module                        | Build prerequisite                           |
| ------------ | ----------------------------------------------- | ----------------------------- | -------------------------------------------- |
| `png`        | `results/png.json`, `benchmarks/png-codec.md`   | `scripts/bench/png.js`        | none, it runs `cargo run` on the crate       |
| `ssim-dssim` | `results/ssim-dssim.json` (no Markdown)         | `scripts/bench/ssim-dssim.js` | none, it runs `cargo run --features dssim`   |
| `png-wasm`   | `results/png-wasm.json`, `benchmarks/png-codec.md` | `scripts/bench/png-wasm.js` | none, it builds the zune shim and the bench app |

## Variants (multi-table pairs)

Some bench files register two tinybench tasks per fixture (no-output and with-output buffer). A pair that shows those as separate tables declares a `variants: [...]` array in `pairs.js`. Each variant has:

- `id`: the artifact section id.
- `section`: the Markdown heading it patches.
- `leftTaskPrefix` / `rightTaskPrefix`: the prefix before `" - "` in the tinybench task name. It selects one variant's rows from the shared JSON file.

Only `core` has variants. `core-wasm` shares `pixelmatch.json` with `core` but has one section, so its `left.taskPrefix` is `"pixelmatch"` to skip the with-output rows.

If a section heading is not in the target Markdown yet, the updater inserts a placeholder section after the last related section. Then it fills the placeholder in the same pass. If a different place reads better, move the new section by hand.

### Extra series (3+ implementations)

A pair can compare more than two implementations against its baseline (`left`) with an `extra: [{ name, cmd, dir, filename, package }, ...]` array. Each extra side becomes its own artifact series and its own Markdown column (latency, `Saved`, `%`). `core-native` uses this to put `blazediff-next` (core-native with `BLAZEDIFF_PNG_ENABLED=1`) next to `blazediff` and `odiff`.

## Workflow

From the repo root:

1. Rebuild what you changed, from the table above. A stale `dist/` benchmarks old code.
2. Run the orchestrator:
   ```sh
   pnpm benchmark <pair> [--iterations N] [--warmup N] [--fixtures a,b] [--skip-run] [--skip-compare] [--skip-artifact] [--skip-md]
   ```
   `run.js` then does these steps in order:
   1. It runs each benchmark command with `--format=json --output=<filename> --iterations=N` (plus `--fixtures` when given), so each writes tinybench-shaped JSON.
   2. It prints the comparison table, through the pair's `.github/workflows/scripts/compare-and-print-*.js` or the shared `compare-and-print.js`.
   3. It writes `benchmarks/results/<key>.json`. With `--skip-artifact` it reads the committed one instead.
   4. It patches the `<table>`, the `_<N> iterations (<M> warmup)_` line and the `> **~X%** performance improvement on average` blockquote in `pair.targetFile` from the artifact.
3. Commit `benchmarks/results/<key>.json` and the Markdown change together.

While you iterate on an algorithm, use `--iterations 2` and a small `--fixtures` subset. Do the full default run only for the numbers you commit.

## PNG codec (`png` standalone)

The `blazediff-png` codec benchmark is a Rust binary that compares four codecs (blazediff, spng, image-rs, zune) for decode, encode and output size:

```sh
pnpm benchmark png              # cargo build + run, then regenerate
pnpm benchmark png --skip-run   # reuse the last JSON
pnpm benchmark png --json <p>   # read/write a specific JSON path
pnpm benchmark png --skip-md    # artifact only
```

It runs `blazediff-png-benchmark -- --json <tmp>` from `crates/`, converts the result into `benchmarks/results/png.json`, and writes `benchmarks/png-codec.md` from that artifact. Without `--json`, the JSON goes to the OS temp directory, so `--skip-run` reuses whatever the last run wrote there.

Encode is measured at two compression modes, so the speed/size trade-off is explicit and zune's stored-only encoder is compared fairly:

- No compression: stored deflate blocks (level 0), no row filtering.
- Half compression: half of each codec's own max deflate level (libdeflate 12 → 6, zlib 9 → 4). zune-png only supports stored output, so its half-compression pass is the same uncompressed encode (about 6× larger).

Each mode gets its own timing section and size section in the artifact. The Rust binary (`codecs::level_label`) reports the level per codec and mode in the JSON's `encodeLevels`. `png.js` copies it into each section's `note`.

## PNG codec in WebAssembly (`png-wasm` standalone)

`@blazediff/codec-png-wasm` against zune-png and `@jsquash/png`, all as wasm in Node:

```sh
pnpm benchmark png-wasm                                # build + run, then regenerate
pnpm benchmark png-wasm --skip-run                     # reuse the last JSON
pnpm benchmark png-wasm --fixtures fixtures/pixelmatch # a subset while iterating
```

zune ships no wasm package, so `apps/image-benchmark/zune-png-wasm` wraps zune-png in a small C ABI. `png-wasm.js` builds it with the same `simd128` flags as the codec, builds the codec module when it is missing, and runs `apps/image-benchmark/src/png-codec/png-wasm-benchmark.ts`. The method matches `png`: best-of, iterations scaled by image size, and every PNG under `fixtures/`.

Encode has two modes:

- No compression: blazediff stored RGBA8 (`color: "rgba8"`) against zune's stored encoder. jSquash has no uncompressed mode, so it is not in this section.
- Default settings: each codec's default. blazediff writes the smallest lossless color mode with fdeflate, jSquash uses the `png` crate's default level, and zune writes stored output.

The results land in `results/png-wasm.json`. `png.js` adds them to `benchmarks/png-codec.md` as a WebAssembly part, whichever of the two benches runs last.

## SSIM vs dssim (`ssim-dssim` standalone)

```sh
pnpm benchmark ssim-dssim               # full corpus up to the default 30 MPx cap
pnpm benchmark ssim-dssim --max-mpx 2   # small corpus while iterating
```

It runs `blazediff-ssim-benchmark --json <tmp>` (feature `dssim`, AGPL, opt-in) and stores the time table as `benchmarks/results/ssim-dssim.json`. Scores and rank agreement stay in the binary's stdout and in the crate README.

## Things to make sure of before you finish

- Run `git diff benchmarks/<target>.md`. Only the targeted sections' data rows, iteration line and blockquote must change. If unrelated sections change, the `findSection()` regex in `update-benchmarks-md.js` matched the wrong section. Stop and inspect it.
- Pairs reuse benchmark JSON paths (for example `apps/image-benchmark/blazediff.json` for `core`, `core-native` and `honeydiff`). Run pairs one at a time, and do not trust a stale JSON for a side you did not run.

## Step-by-step fallback

If `run.js` stops part way, run the steps by hand from the repo root:

```sh
# 1. Per-side benchmark runs (substitute the pair's commands).
pnpm --filter @blazediff/image-benchmark pixelmatch -- --format=json --output=pixelmatch.json --iterations=50
pnpm --filter @blazediff/image-benchmark core -- --format=json --output=blazediff.json --iterations=50

# 2. Write the artifact and patch the Markdown from the JSON you have.
pnpm benchmark core --skip-run --skip-compare
```

## Do not

- Do not update Markdown or artifacts from numbers in chat. Always run the benchmarks. Hand-typed numbers go stale within a release.
- Do not run more than one pair at a time. Shared JSON output paths clobber each other, and parallel load skews the timings.
- Do not add new compare-and-print wrappers unless someone asks. The orchestrator already handles pairs without one.
