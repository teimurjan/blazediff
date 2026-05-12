# BlazeDiff

Monorepo for image and object diffing libraries. Uses pnpm workspaces.

## Commands

- `pnpm build` - Build all packages (excludes website)
- `pnpm test` - Run all tests (vitest + jest)
- `pnpm typecheck` - Typecheck all packages
- `pnpm deno:test` - Run Deno smoke tests (`.deno.test.ts` per JSR package)
- `pnpm check:write` - Lint + format (biome)
- `npx @j178/prek run --all-files` - Run pre-commit hooks (biome + cargo fmt)

## Benchmarks

Build benchmarks first: `pnpm --filter @blazediff/image-benchmark build && pnpm --filter @blazediff/object-benchmark build`

### Image benchmarks

```sh
pnpm benchmark:core          # blazediff core (pixel-by-pixel)
pnpm benchmark:binary        # blazediff native binary
pnpm benchmark:odiff         # odiff comparison
pnpm benchmark:pixelmatch    # pixelmatch comparison
pnpm benchmark:ssim          # blazediff SSIM
pnpm benchmark:gmsd          # blazediff GMSD
pnpm benchmark:hitchhikers-ssim
pnpm benchmark:ssim.js       # ssim.js comparison
pnpm benchmark:weber-ssim.js # ssim.js weber comparison
```

Image fixture dirs: `pixelmatch`, `blazediff`, `4k`, `page`, `same`

### Object benchmarks

```sh
pnpm benchmark:object           # blazediff-object
pnpm benchmark:microdiff        # microdiff comparison
pnpm benchmark:opentf-obj-diff  # @opentf/obj-diff comparison
```

Object fixture names: `simple`, `nested`, `large`, `deep`, `complex`

### Python benchmarks

Compare the PyO3-backed `blazediff` PyPI package against pypi `pixelmatch` and OpenCV `cv2.absdiff` on the same `/fixtures/` PNG pairs.

```sh
# One-time setup (creates venv, installs deps, builds + installs local blazediff wheel)
bash apps/python-benchmark/scripts/setup.sh

pnpm benchmark:python-blazediff   # blazediff (PyO3) compare()
pnpm benchmark:python-pixelmatch  # pixelmatch (PIL) comparison
pnpm benchmark:python-opencv      # cv2.absdiff baseline (grayscale)
```

`blazediff.compare` is path-based, so all three Python timings include PNG decode. Comparison is meaningful **across the three Python targets**, not against the JS image-benchmark numbers.

### Filtering fixtures

Use `--fixtures` to run only specific fixtures for faster iteration:

```sh
# Image: run only pixelmatch fixtures
pnpm benchmark:core -- --fixtures=pixelmatch

# Image: run pixelmatch + blazediff fixtures
pnpm benchmark:ssim -- --fixtures=pixelmatch,blazediff

# Object: run only simple fixtures
pnpm benchmark:object -- --fixtures=simple

# Combine with fewer iterations for quick checks
pnpm benchmark:core -- --fixtures=pixelmatch --iterations=2
```

When making changes to diff algorithms, use `--fixtures` with a small subset (e.g., `pixelmatch`) and low `--iterations` for fast verification, then run the full suite before merging.

## Interpret

Module at `crates/blazediff/src/interpret/`. Part of the `blazediff` crate. Wraps `blazediff::diff()` to produce structured region analysis.

### Pipeline

```
change mask → morph close → connected components → per-region analysis → classify → describe
```

- **Don't add watershed/distance-transform** — morph close + CC is sufficient for grouping changed pixels. Watershed over-segments the known change mask.
- **Don't restructure into atomic-regions → semantic-groups → score-labels** — the 6-label decision tree is adequate. Better results come from better evidence extraction, not pipeline restructuring.

### Testing

```sh
cd crates && cargo test -p blazediff
cargo check -p blazediff --features napi    # verify N-API compiles
cargo check -p blazediff --features python  # verify PyO3 compiles
cargo run -p blazediff -- ../fixtures/blazediff/3a.png ../fixtures/blazediff/3b.png --interpret
```

## Python distribution (PyPI)

The `blazediff` PyPI package ships PyO3 bindings to the same Rust core, mirroring NAPI:

- Bindings live in `crates/blazediff/src/python.rs` behind the `python` Cargo feature (mirrors the `napi` feature). Public surface: `compare(base_path, compare_path, diff_output=None, *, threshold, antialiasing, diff_mask, compression, quality, interpret, output_format)` and `interpret_images(image1_path, image2_path, *, threshold, antialiasing)`.
- Build (native only): `pnpm build:python` → wheel in `crates/blazediff/dist/wheels/`.
- Build (all 6 platforms, local cross-compile): `pnpm build:python:all`. Requires `zig` (`brew install zig`) for Linux manylinux wheels and `cargo-xwin` for Windows MSVC.
- Maturin config at `crates/blazediff/pyproject.toml` uses `abi3-py38` so a single wheel per platform serves all CPython ≥3.8.
- Wheels are platform-tagged; pip auto-selects the right one — no per-platform wrapper package needed (unlike NAPI's `core-native-{platform}` sub-packages).

### Release flow (wheels-in-repo, idempotent, mirrors `publish-rust.js`)

Wheels are cross-built locally and **committed to `crates/blazediff/wheels/`** as the source of truth. CI checks them out and uploads to PyPI via Trusted Publishing (OIDC, no PyPI token).

```sh
git pull origin main          # version-bumped Cargo.toml
pnpm build:python:all         # cross-build into dist/wheels/, sync to crates/blazediff/wheels/
git add crates/blazediff/wheels && git commit -m "chore(release): wheels v{version}" && git push
pnpm release:pypi             # check + dispatch the workflow
```

`scripts/publish-pypi.js` reads the Cargo.toml version, then:

1. Asks PyPI if `blazediff@{version}` already exists → if yes, skip.
2. Looks for wheels matching `{version}` in `crates/blazediff/wheels/` → if none, skip with hint.
3. Checks git status — if wheels uncommitted, refuses with a hint to commit + push.
4. Otherwise: triggers `publish-pypi.yml` via `gh workflow run`.

The workflow checks out main, sanity-checks that the committed wheels match the input version + Cargo.toml, then runs `maturin upload --skip-existing crates/blazediff/wheels/*.whl` (idempotent — already-uploaded wheels are skipped).

`build-maturin.sh` syncs wheels by deleting `crates/blazediff/wheels/*.whl` first, then copying — so the committed dir always reflects the latest build (no stale wheels accumulate).

The script is also wired into `pnpm run release`. A Changesets-driven release picks it up when wheels are present + committed for the new version; otherwise it skips with a friendly message.

One-time setup before first publish:
- PyPI Trusted Publisher: https://pypi.org/manage/account/publishing/ → pending publisher (project=`blazediff`, owner=`teimurjan`, repo=`blazediff`, workflow=`publish-pypi.yml`, environment=`pypi`).
- GitHub repo settings → Environments → New environment named `pypi` (optionally add review gates).

## Build scripts

`crates/blazediff/scripts/` is split by output type, all sharing helpers via `_targets.sh`:

- `build-all.sh` — CLI binary builder + orchestrator. `--napi` and `--maturin` flags forward the same target scope (`--native`/`--macos`/`--all`/`--target X`) to the sibling scripts.
- `build-napi.sh` — N-API `.node` files. Syncs into `packages/core-native-{platform}/` after build.
- `build-maturin.sh` — Python wheels via maturin. Outputs into `dist/wheels/`. No package sync (PyPI uses platform tags).
- `_targets.sh` — sourced helpers: target table, RUSTFLAGS profiles, host detection, `cross`/`cargo-xwin` checks. Not directly executable.

Common invocations: `pnpm build:rust` → `build-all.sh --all --napi`; `pnpm build:python` → `build-maturin.sh` (native). For everything in one shot: `bash crates/blazediff/scripts/build-all.sh --all --napi --maturin`.

## Dual distribution (NPM + JSR)

Every TypeScript package publishes to both NPM (via Changesets) and JSR (via `deno publish`). The native-binary sub-packages `@blazediff/core-native-*` stay NPM-only; Deno consumers resolve them through `npm:` specifiers declared in `@blazediff/core-native`'s `deno.json`.

- Per-package config lives in `packages/*/deno.json` (workspace members listed in root `deno.json`).
- `pnpm run release` chains `changeset publish` (NPM) → `publish-rust.js` (crates.io) → `publish-jsr.ts` (JSR). The JSR step is a no-op when no `deno.json` version moved.
- `scripts/publish-jsr.ts` is a Deno script (requires `deno` on PATH) — syncs `deno.json#version` from `package.json#version`, then runs `deno publish --allow-dirty`. CI authenticates via GitHub OIDC (`id-token: write`); locally it falls through to browser OAuth on first run.
- Per-package Deno smoke tests live at `packages/*/src/*.deno.test.ts`. Node's vitest/jest runners exclude them (see `configDefaults.exclude` in each vitest config and `testPathIgnorePatterns` in `packages/jest/jest.config.js`); Node's `tsc` excludes them via each package's `tsconfig.json#exclude`.
- `.vscode/settings.json` points Deno's LSP at those test files via `deno.enablePaths`, so the editor understands `jsr:` specifiers and `Deno` globals there while Node's TS LSP stays in charge everywhere else.

JSR slow-types verification: `cd packages/<x> && npx jsr publish --dry-run` — a flat workspace-root `deno check` can't satisfy the different type contexts at once (Node `Buffer` in ssim, `dom` in ui, JSX augmentation in react, jest globals in jest), so check per package.

### JSR-only source patches

Packages that need a Node-only import for JSR's publish-time `deno check` but must NOT ship that import in the NPM/Vite bundle (e.g. `import { Buffer } from "node:buffer"` in `@blazediff/core`) use a `jsr.patch` file at the package root. It's a plain `patch -p1`-compatible unified diff.

- `scripts/publish-jsr.ts` applies every `packages/*/jsr.patch` before publishing and reverts them in a `finally` — all at once, because JSR's type-check follows workspace imports into upstream sources during a downstream publish.
- `scripts/check-jsr-patches-clean.sh` runs as a pre-commit hook and aborts the commit if any patch is currently applied, so committed source always matches NPM's Vite-safe state.
- To regenerate a patch: apply your change locally, `git diff -- packages/<pkg>/src > packages/<pkg>/jsr.patch` (strip the `a/packages/<pkg>` prefix so paths are pkg-relative), then `patch -p1 -R -i jsr.patch` to restore source.

NPM-only (not on JSR):
- `@blazediff/bun` — imports `bun:test`, which JSR's publish-time `deno check` doesn't resolve.
- `@blazediff/vitest` / `@blazediff/jest` — their purpose is to augment each runner's `Matchers` interface (`declare module "vitest"`, `declare global { namespace jest }`). JSR forbids module/global type augmentation, so these stay NPM-only.
- `@blazediff/ui` — web components have slow-types violations (implicit return type on every `static get observedAttributes`). Stay NPM-only until the components get explicit annotations.
- `@blazediff/react` — depends on `@blazediff/ui`; follows the same deferral.

## Agent (`@blazediff/agent`)

Agentic visual regression layer. Lives at `packages/agent/`. Ships a deterministic CLI (`blazediff-agent`) plus a portable playbook (`skill/blazediff/SKILL.md`) that any coding agent (Claude Code, Cursor, Codex) drives. **No embedded LLM call** in the default flow — the host coding agent supplies the loop, vision, and context. An optional `--judge host` backend defers ambiguous diffs to the host via filesystem handoff (region tiles + locator thumbnail; the agent writes `verdict.json` back).

Roadmap and design intent: `packages/agent/ROADMAP.md`. End-user docs: `apps/website/app/docs/agent/page.mdx`.

### Critical files

- `packages/agent/src/cli.ts` — Commander entry point
- `packages/agent/src/check.ts` — single-pool `runCheck` with `pool()` concurrency
- `packages/agent/src/graph/` — LangGraph-pipelined runner (`run` command); per-route stages overlap
- `packages/agent/src/judge/` — pluggable `Judge` interface (`host` / `none`), region-tile generator (`sharp`), verdict applier
- `packages/agent/src/diff/verdict.ts` — heuristic verdict pipeline (`regression-likely | intentional-likely | noise-likely | ambiguous`)
- `packages/agent/src/browser/launch.ts` — Chromium serialization (prevents the launch race) + `applyMaskOverlays()` (paints `document.querySelectorAll(selector)` matches with magenta rects before screenshot)
- `packages/agent/src/report/markdown.ts` — `summary.md` generator (5-column `id | baseline | actual | diff | verdict` with inline image previews)
- `packages/agent/src/discover/` — Next.js / Vite / Remix source-walking, BFS `discover` command as fallback

### Commands the agent exposes

`onboard`, `init`, `discover`, `capture --stdin`, `check`, `run`, `rewrite`, `diff`, `manifest`, `serve-status`, `browsers install`, `reset --yes`. All accept `--json`. `--cwd <abs-path>` operates on a sub-directory.

`check` is the single-pool CI verb; `run` is the LangGraph-pipelined equivalent (≥10 routes, want LangSmith traces, want wall-time speedup). Both share report shape.

`onboard` installs the bundled SKILL.md into the detected coding-agent harness. Targets: Claude Code → `<project>/.claude/skills/blazediff/SKILL.md` (project-scope); Codex → `~/.codex/prompts/blazediff.md` (user-global — Codex CLI's slash-command prompts live there, not in `AGENTS.md`); Cursor → `<project>/.cursor/rules/blazediff.mdc` with frontmatter. Override autodetect with `--harness claude,codex,cursor` or `--harness all`. SKILL.md is bundled into the published package via `prebuild` copy from `skill/blazediff/SKILL.md` and loaded at runtime by `src/onboard/skill-loader.ts`.

### Skill / playbook

`skill/blazediff/SKILL.md` is the authoritative playbook the host coding agent reads. Covers: target-dir resolution, authoring vs check mode selection, the judge handoff (with token-discipline guidance — `regions.png` first, full-page PNGs only as fallback), the mask flow (when to mask vs rewrite, how to pick a stable selector like `data-blazediff-mask="<reason>"`), `accept regression (rebaseline)`, `reset`, and hard rules (no manifest-direct edits, mandatory dev-server teardown, CI-only commands).

When editing the skill, mirror substantive changes into `apps/website/app/docs/agent/page.mdx` and `packages/agent/README.md` so the three stay in sync.

### `.blazediff/` on-disk shape

```
.blazediff/
├── config.json           # devServer / framework / baseUrl  (committed)
├── manifest.json         # { entries: [{ id, url, mask[], viewport, waitFor, fullPage }] }  (committed; never edit by hand)
├── baselines/<id>.png    # committed
├── actual/<id>.png       # per-run; gitignored
├── actual/<id>.diff.png  # per-run; gitignored
├── judgments/<id>/
│   ├── request.json      # JudgmentRequest written by host judge backend
│   ├── regions.png       # tight crop of all change regions at native res
│   ├── locator.png       # ~400px page thumbnail with bboxes drawn
│   └── verdict.json      # written by the host coding agent
├── summary.md            # 5-column markdown report (regenerated per check)
└── pid / log             # tracked dev-server state
```

### Mask semantics

`mask: string[]` per entry. Each string is a CSS selector. At screenshot time, `applyMaskOverlays()` queries `document.querySelectorAll(sel)` and paints a magenta rectangle over each match's bounding rect. Applied in both baseline and actual, so diff is zeroed inside the masked region. Mask whenever the region is inherently non-deterministic (auto-cycling animations, third-party iframes, time-derived content, randomized avatars); don't mask real content that just happens to be changing.

## Pre-commit

Uses [prek](https://github.com/j178/prek) (`.pre-commit-config.yaml`). Hooks run automatically on `git commit`:

- **biome check** — `biome check --write` on JS/TS/JSON
- **cargo fmt** — `cargo fmt` on Rust

Run `npx @j178/prek install` after cloning to set up git hooks.
