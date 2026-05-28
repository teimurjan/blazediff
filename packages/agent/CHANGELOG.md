# @blazediff/agent

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
