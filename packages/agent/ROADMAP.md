# @blazediff/agent — roadmap

BlazeDiff is a harness-rider: the package ships a deterministic CLI + a portable playbook (`skill/blazediff/SKILL.md`) that any coding agent (Claude Code, Codex, Cursor) drives. No embedded LLM call, no API key required for the default flow — the host coding agent supplies the loop, vision, and context engineering.

This file tracks where the agent layer is going.

---

## Phase 1 — pluggable Judge + `host` backend (done)

**Why:** the heuristic verdict (`regression-likely | intentional-likely | noise-likely | ambiguous`) is right most of the time but punts on `ambiguous`. The host coding agent has vision; let it judge.

**Shipped:**
- `src/judge/{types,host-harness,none,index,apply}.ts` — `Judge` interface, `host` (filesystem handoff) and `none` (passthrough) backends, `applyJudgments()` merger.
- `check --judge host|none` flag (defaults `none` for back-compat).
- `check --apply-judgments` flag — merges `.blazediff/judgments/*.json` into the last report, deletes consumed pending files.
- `CheckResult.status` extended with `"needs-judgment"`; `CheckReport.pendingJudgments` count added.
- `SKILL.md` "judge ambiguous diffs" section documents the exact JSON shape the host agent writes.

**Verified:** Claude Code running through the skill produces correct verdicts on the website fixture without any API key.

---

## Phase 1.5 — region tile cropping for judge efficiency

**Problem:** today the host backend hands the judge the full baseline / actual / diff PNGs (~1–3 MB each, ~2000×1500 px). For a 182×10 px change region, the judge wastes ~100× the vision tokens it needs and ends up playing Where's-Waldo.

**Win:** cropped per-region tiles cut vision cost by 50–100× and improve classification accuracy (judge sees the changed pixels at native resolution).

**Design:** for each ambiguous result, before writing the pending-judgments JSON, generate composite tiles:

```
.blazediff/pending-judgments/<id>/
  ├── region-0.png       # [baseline | actual | diff] side-by-side, 16px padding
  ├── region-1.png
  ├── ...
  └── locator.png        # ~400px page thumbnail with all region bboxes drawn,
                         # so the judge has spatial context
```

Pending JSON gains `regions[i].tilePath` and a top-level `locatorPath`. Full-image paths stay as fallback. Skill instruction: *"Read the locator for orientation, then the region tiles. Don't open the full diff PNG unless tiles are ambiguous."*

**Caps:** top-N regions per entry by `pixelCount` (default 5). Smaller regions stay listed in JSON without tiles.

**Files:**
- `src/judge/host-harness.ts` — add `prepareTiles()` step before write.
- `src/judge/tiles.ts` (new) — crop + side-by-side composite + locator generation.
- `src/judge/types.ts` — extend `JudgmentRequest` with tile paths.
- `skill/blazediff/SKILL.md` — judge instructions read tiles first.

**Dependency:** `sharp` (libvips-backed, native). Faster than pure-JS alternatives, and the project already ships native bindings (`@blazediff/core-native`), so the philosophical bar is already cleared. Cropping + horizontal stitching is ~30 lines via `sharp.extract()` + `sharp.composite()`.

**Verification:**
1. Run `check --judge host` against the website with a known-noise diff.
2. Inspect `.blazediff/pending-judgments/<id>/region-0.png` — should be a strip showing baseline | actual | diff of just the changed area.
3. Check vision-token cost in the host agent's reasoning — should drop ~100× per ambiguous entry.

---

## Phase 2 — rewrite-vs-ignore interaction polish

**Problem:** after judging, the host agent currently asks the user per-failure ("rewrite this one? ignore that one?"). For sites with N noise-likely failures and M intentional-likely failures, this is N+M questions and N+M `rewrite <id>` calls. Annoying and error-prone.

**Goal:** one question per `verdict.action` group, one CLI call per decision.

**Design:** group failures by `verdict.action` after `check` finishes and present batched choices:

```
  4 noise-likely (action: ignore-or-rewrite): home, agent, docs, examples
    → ignore all / rewrite all / pick individually?

  2 intentional-likely (action: rewrite-if-intended): pricing, blog
    → confirm rewrite both?

  1 regression-likely (action: investigate): checkout
    → look at .blazediff/diffs/checkout.png
```

**CLI surface additions (`rewrite` command):**
- `blazediff-agent rewrite --action ignore-or-rewrite` — rewrite all entries in the last report whose `verdict.action === "ignore-or-rewrite"`. Used for batch "accept all noise."
- `blazediff-agent rewrite --action rewrite-if-intended` — same for intentional.
- `blazediff-agent rewrite --failed` already exists; keep it as a "rewrite everything failing" escape hatch.

**Skill instruction (replacing the current per-entry loop):**
> After `check`/`apply-judgments`, group `report.results` by `verdict.action`. Ask the user once per group, never per entry. Default suggestions:
> - `ignore-or-rewrite` (noise-likely): suggest **rewrite all** unless the user has reason to keep stale baselines.
> - `rewrite-if-intended` (intentional-likely): require explicit confirmation, then rewrite all in one call.
> - `investigate` (regression-likely): never auto-rewrite. Show the diff path and stop.

**Files:**
- `src/cli/commands/rewrite.ts` — add `--action <action>` flag; read last report, filter ids by `verdict.action`, call existing rewrite logic.
- `skill/blazediff/SKILL.md` — replace the per-label loop with the grouped flow above.

**Verification:**
1. Trigger 4+ ambiguous failures, judge them as a mix of noise/intentional.
2. Run through the skill — should see 2–3 total questions, not 6+.
3. `blazediff-agent rewrite --action ignore-or-rewrite --json` returns ids rewritten + a clean exit code.

---

## Phase 3 — LangGraph.js pipeline

**Problem:** the current flow is strictly sequential: `discover → capture (full batch) → check (full batch) → judge (full batch)`. On a 50-route site, the slow stage of each phase blocks the next. Wall-time waste is 2–3×.

**Goal:** stream routes through the pipeline. As soon as `discover` finds a route, it gets captured; as soon as a capture lands, it gets checked; as soon as a check returns `ambiguous`, the judge tile-prep runs. Three "agents" run concurrently with backpressure between them.

**Stack:** LangGraph.js `StateGraph` + `Send` API. Aligns with the 2026 agent-engineering roadmap's Phase 2 stack and gives free LangSmith tracing.

**Graph shape:**

```
       ┌──────────┐
       │ discover │  emits routes as it finds them
       └────┬─────┘
            │ Send(route) × N  (parallel fan-out)
            ▼
       ┌──────────┐
       │ capture  │  pool size = --concurrency
       └────┬─────┘
            │ Send(captureResult)
            ▼
       ┌──────────┐                ┌─────────┐
       │  check   │ ─ambiguous? ─► │  judge  │ ─tile+defer─┐
       └────┬─────┘                └─────────┘             │
            │ pass / definite verdict ◄────────────────────┘
            ▼
       ┌──────────┐
       │ aggregate│  writes report.json
       └──────────┘
```

**State:**

```ts
type GraphState = {
  config: AgentConfig;
  mode: "baseline" | "actual";
  routes: DiscoveredRoute[];          // appended by discover, drained by capture Sends
  captures: CaptureResult[];           // appended by capture, drained by check Sends
  results: CheckResult[];              // appended by check + judge
  pendingJudgments: JudgmentRequest[]; // populated when host Judge defers
};
```

**CLI surface:**

```
blazediff-agent run [--mode baseline|actual] [--concurrency N] [--judge host|none] [--json]
```

Existing `init / discover / capture / check / rewrite / reset` stay untouched — `run` is the new orchestrated path. Eventually `check` becomes a thin wrapper over `run` with mode=actual.

**Files:**
- `src/graph/state.ts` — shared state schema.
- `src/graph/nodes/{discover,capture,check,judge,aggregate}.ts` — one per stage.
- `src/graph/index.ts` — `compile()` + `run(config, opts)`.
- `src/cli/commands/run.ts` — new CLI command.
- `src/discover.ts` — refactor to expose an async-iterator form alongside the existing batch form (the graph drains routes as they're found).
- `package.json` — add `@langchain/langgraph` dep.
- `skill/blazediff/SKILL.md` — happy path becomes `run`; `check` stays documented as the granular form.

**Checkpointing:** LangGraph `MemorySaver` for v1 (in-process). Filesystem saver writing to `.blazediff/state/<runId>/` is a follow-on if real users hit multi-minute crashes.

**Tracing:** honor `LANGSMITH_API_KEY` env var. Zero code; LangGraph picks it up.

**Verification:**
1. `time blazediff-agent check` (sequential) vs `time blazediff-agent run` (pipelined) on a fresh `.blazediff/actual/` cache with ≥20 routes. Target: ≥2× wall-time speedup.
2. JSON output streams per-route updates rather than emitting only at the end.
3. Force-kill mid-run with SIGKILL. Browser cleanup must still run (the chromium-serialization fix from commit `0b1f472` must remain reachable from the graph runner).
4. If `LANGSMITH_API_KEY` set, confirm a trace appears showing the discover→capture→check→judge fan-out.

---

## Explicitly deferred / not doing

- **Anthropic `Judge` backend.** Not on the roadmap. The `host` backend covers our use case at zero cost; an inline Anthropic-SDK backend is only worth building if we need fully headless CI runs without a coding agent present.
- **Eval harness + golden dataset.** Useful eventually but premature until Phase 1.5 + 2 + 3 are in real users' hands.
- **Multi-harness playbook mirroring** (write `AGENTS.md` / `.cursor/rules/blazediff.mdc` on `init`). Useful for Codex/Cursor parity but lower priority than Phase 1.5 + 2 + 3.
- **Durable execution layer** (Inngest / Temporal / PostgresSaver). LangGraph's `MemorySaver` suffices until proven otherwise.
- **Replacing existing subcommands.** `init / discover / capture / check / rewrite / reset` stay. The new `run` command adds; it doesn't replace.

---

## Critical files (current)

- `src/cli.ts` — entry point.
- `src/check.ts` — `runCheck`, `pool()` concurrency, judge dispatch.
- `src/cli/commands/check.ts` — `--judge` / `--apply-judgments` flags.
- `src/judge/host-harness.ts` — pending-judgment writer (target of Phase 1.5 changes).
- `src/judge/apply.ts` — judgment merger.
- `src/diff/verdict.ts` — heuristic; first pass that the Judge upgrades.
- `src/browser/launch.ts` — chromium serialization; must stay reachable from any new orchestrator.
- `skill/blazediff/SKILL.md` — playbook the host agent reads.
