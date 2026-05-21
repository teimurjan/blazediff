# @blazediff/agent

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
