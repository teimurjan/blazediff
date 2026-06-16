# @blazediff/agent

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
