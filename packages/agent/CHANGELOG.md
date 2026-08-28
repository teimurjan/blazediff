# @blazediff/agent

## 0.11.2

### Patch Changes

- Updated dependencies [544b45e]
  - @blazediff/interpret-native@6.4.0

## 0.11.1

### Patch Changes

- @blazediff/core-native@6.0.1
- @blazediff/interpret-native@6.3.0

## 0.11.0

### Minor Changes

- 0fc2662: Ship a second skill, `image-compare`, and turn `skill/` into a registry that onboarding installs from. The existing `blazediff` skill only covers visual regression against a running app; comparing two image files already on disk had no entry point, so `blazediff-cli`'s `interpret` was reachable only by someone willing to set up a whole baseline suite. `onboard` now writes every bundled skill for each detected stack — `.claude/skills/<skill>/`, `~/.codex/skills/<skill>/`, `.cursor/rules/<skill>.mdc` — and `installStack` returns one `InstallResult` per skill instead of one per stack. Stack targets take the skill name, `loadSkillFiles(skill)` discovers a skill's files from disk rather than a hardcoded list, and the Cursor rule's `description` is now parsed from the skill's own frontmatter instead of being duplicated in the installer (which also fixes the trigger phrases losing their quotes). The prebuild copy moved to `scripts/copy-skills.mjs` and mirrors `skill/*/` into `packages/agent/skills/*/`.

## 0.10.2

### Patch Changes

- Updated dependencies [5b9f7f8]
  - @blazediff/interpret-native@6.2.0

## 0.10.1

### Patch Changes

- Updated dependencies [2d09fea]
  - @blazediff/interpret-native@6.1.0

## 0.10.0

### Minor Changes

- 85f66f5: Interpretation moves to `@blazediff/interpret-native`, and the SSIM metrics to
  `@blazediff/ssim-native`.

  **Breaking.** `interpret()` is gone from `core-native` and `core-wasm`, along
  with the `interpret` option on `compare()`/`diff()`, the `InterpretResult`,
  `ChangeRegion`, `BoundingBox` and `DiffResult` types, the `interpretRgba` wasm
  export, and the Python `interpret_images`. The CLI drops `core-native
--interpret` for a `blazediff-cli interpret` command, which adds a `--source`
  choice of how regions are located: a pixel diff, or an SSIM map.

### Patch Changes

- Updated dependencies [85f66f5]
  - @blazediff/core-native@6.0.0
  - @blazediff/interpret-native@6.0.0

## 0.9.1

### Patch Changes

- Updated dependencies [7a377ed]
  - @blazediff/core-native@5.4.0

## 0.9.0

### Minor Changes

- 0b21acd: Improve check progress and cancellation, and expand the visual review workflow.

## 0.8.2

### Patch Changes

- Updated dependencies [548266e]
  - @blazediff/core-native@5.3.0

## 0.8.1

### Patch Changes

- Updated dependencies [44a5292]
- Updated dependencies [44a5292]
  - @blazediff/core-native@5.2.0

## 0.8.0

### Minor Changes

- 723e24c: Make route discovery configurable and respect config defaults.

  `discover` now reads its settings (`maxRoutes`, `sampleTemplates`, `sampleThreshold`, `samplesPerTemplate`) from the `discovery` block in your config, with precedence of explicit CLI flag > config > built-in default. `onboard` gains a `--no-sample-templates` flag so you can capture every reachable route from scratch instead of sampling template groups.

### Patch Changes

- Updated dependencies [27841f8]
  - @blazediff/core-native@5.1.0

## 0.7.0

### Minor Changes

- b279520: Added dev server start on check if not running

## 0.6.0

### Minor Changes

- b4bf8e4: Route discovery now mirrors a real user: `discover` crawls links from the landing page and returns only reachable routes. The Next.js manifest scan and `/sitemap.xml` fetch are removed (a route no page links to is excluded), and the crawl waits for client-rendered nav before reading links. Large list→detail template groups (e.g. `/blog/*`) are sampled to a couple representatives instead of enumerated; tune with `--samples-per-template` / `--sample-threshold` or disable via `--no-sample-templates`. The SKILL.md authoring flow is updated to use the crawl as the primary discovery source instead of reading router folder structure.

## 0.5.0

### Minor Changes

- 6d094c9: Fold setup into one onboard command

## 0.4.0

### Minor Changes

- fc369d6: Add `review` webapp (Vite + node SSR; replaces `summary.html`), local Moondream/Qwen judge with serialized per-test progress, two-phase capture→dispatch graph, and generic harness loader. The `auth` subcommand is folded into `harness record`.

### Patch Changes

- Updated dependencies [fc369d6]
  - @blazediff/core-native@5.0.0

## 0.3.0

### Minor Changes

- 398bb07: Made harnesses generic

## 0.2.1

### Patch Changes

- Updated dependencies [351c995]
  - @blazediff/core-native@4.3.4

## 0.2.0

### Minor Changes

- f4ee710: Add auth harness generation

## 0.1.4

### Patch Changes

- @blazediff/core-native@4.3.3

## 0.1.3

### Patch Changes

- Updated dependencies [4dc5244]
  - @blazediff/core-native@4.3.2

## 0.1.2

### Patch Changes

- Updated dependencies [442d1ee]
  - @blazediff/core-native@4.3.1

## 0.1.1

### Patch Changes

- Updated dependencies [345e842]
  - @blazediff/core-native@4.3.0

## 0.1.0

### Minor Changes

- 0b33dd9: Rebuild the agent as a proper LangGraph pipeline: per-entry `capture → diff → judge` runs as an isolated subgraph (fixing fan-out races), every non-match routes through the judge, and `interrupt()` + an FS checkpoint saver let `--judge host` suspend mid-run and resume via `check --apply-judgments`. Streaming progress to stderr, parallelized `runCaptures` (so `rewrite --all` matches `check` throughput), and post-rewrite cleanup of stale `actual/`, `judgments/`, `summary.md`, and `checkpoints/`.
