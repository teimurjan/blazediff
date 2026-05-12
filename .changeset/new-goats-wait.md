---
"@blazediff/agent": minor
---

Rebuild the agent as a proper LangGraph pipeline: per-entry `capture → diff → judge` runs as an isolated subgraph (fixing fan-out races), every non-match routes through the judge, and `interrupt()` + an FS checkpoint saver let `--judge host` suspend mid-run and resume via `check --apply-judgments`. Streaming progress to stderr, parallelized `runCaptures` (so `rewrite --all` matches `check` throughput), and post-rewrite cleanup of stale `actual/`, `judgments/`, `summary.md`, and `checkpoints/`.
