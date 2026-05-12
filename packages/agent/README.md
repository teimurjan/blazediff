# @blazediff/agent

Agentic visual regression for BlazeDiff. Auto-discovers routes, captures deterministic screenshots via Playwright, compares them against committed baselines using the native BlazeDiff core, and hands ambiguous diffs back to your coding agent (Claude Code, Cursor, Codex) to judge.

The package ships a deterministic CLI (`blazediff-agent`) plus a portable playbook (`skill/blazediff/SKILL.md`) that any host coding agent drives. No embedded LLM call, no API key in the default flow - the host supplies the loop, vision, and context.

## Install

```sh
npm install -g @blazediff/agent
# or as a dev dep
npm install --save-dev @blazediff/agent
```

First run will prompt to install Chromium via the bundled Playwright. No sudo, no `npx playwright install --with-deps`.

## Quickstart

```sh
# 1. Author (from your coding agent, via /blazediff or equivalent)
blazediff-agent init --json                # writes .blazediff/config.json
blazediff-agent browsers install --check   # ensure chromium
# host agent discovers routes and pipes them to:
echo '[{"id":"home","url":"/"}]' | blazediff-agent capture --stdin --mode baseline --json

# 2. Check (CI or local)
blazediff-agent run --judge host --json    # pipelined: capture → diff → verdict → judge
# or
blazediff-agent check --judge host --json  # single-pool, simpler

# 3. Accept intentional regression
blazediff-agent rewrite home --json
```

Commit `.blazediff/` (config + manifest + baselines). Run `check` / `run` in CI.

## Onboarding a coding agent

`blazediff-agent onboard` installs the playbook into whatever coding-agent harness you're using:

```sh
blazediff-agent onboard --json                 # auto-detect Claude Code / Codex / Cursor in cwd
blazediff-agent onboard --harness codex        # explicit (override detection)
blazediff-agent onboard --harness all          # all three
blazediff-agent onboard --force                # overwrite existing playbook
```

Per harness:

- **Claude Code** writes `<project>/.claude/skills/blazediff/SKILL.md`
- **Codex** writes `~/.codex/prompts/blazediff.md` (user-global; Codex CLI looks here for slash-command prompts)
- **Cursor** writes `<project>/.cursor/rules/blazediff.mdc` with the right frontmatter

Detection is project-local (looks for `.claude/` / `CLAUDE.md` / `AGENTS.md` for Claude Code, `AGENTS.md` / `.codex/` for Codex, `.cursor/` / `.cursorrules` for Cursor). Both Claude Code and Codex read `AGENTS.md`, so a project with only `AGENTS.md` will install for both. On a TTY with no detection, the command prompts.

## Commands

| Command | What it does |
|---|---|
| `onboard` | Install the playbook into the detected coding-agent harness (Claude Code, Codex, Cursor) |
| `init` | Detect framework/dev-script, write `.blazediff/config.json` + `.gitignore` |
| `discover` | BFS-crawl routes from `baseUrl` as a fallback when source-walking fails |
| `capture --stdin` | Read a JSON list of routes, screenshot each, write baselines/actuals + manifest |
| `check` | Re-capture every manifest entry, diff against baseline, emit `CheckReport` |
| `run` | Same as `check` but pipelines capture → diff → verdict → judge via LangGraph for parallelism + LangSmith traces |
| `rewrite <id...>` | Re-baseline existing manifest entries (preserves mask/viewport/waitFor) |
| `diff <id>` | Re-diff one entry against its actual capture without re-screenshotting |
| `manifest` | Inspect / list manifest entries |
| `serve-status` | Start / stop / probe the configured dev server |
| `browsers install` | Install bundled Playwright Chromium |
| `reset --yes` | Wipe `.blazediff/` entirely |

All commands accept `--json` for machine-readable output. Pass `--cwd <abs-path>` to operate on a sub-directory (e.g. an app inside a monorepo).

## Judging model

The diff heuristic emits one of `regression-likely | intentional-likely | noise-likely | ambiguous`. The first three are acted on directly. For `ambiguous`, the `--judge host` backend writes a `JudgmentRequest` (region tiles + locator thumbnail + bbox metadata) to `.blazediff/judgments/<id>/request.json` and exits with a non-zero `pendingJudgments` count.

The host coding agent reads `regions.png` (a tight crop of every change at native resolution) and `locator.png` (a small overview thumbnail), writes a `verdict.json` next to the request, and re-runs `check --apply-judgments` to merge the verdicts into the report. The full playbook lives in `skill/blazediff/SKILL.md` at the repo root.

This handoff was designed for vision-token efficiency: the region tiles are 10–100× smaller than the full-page PNGs and contain everything needed to classify the change.

## Masking unstable regions

Auto-cycling carousels, third-party iframes, clocks, randomized avatars and other non-deterministic content should be masked, not re-baselined. Masks are CSS selectors per manifest entry, painted with a magenta rectangle in both baseline and actual so the diff is zeroed.

Prefer a stable attribute on the source element (`data-blazediff-mask="<reason>"`) and select on it; for external embeds you can't annotate, target the element type (`iframe`, `video`). Re-capture with the mask via `capture --stdin --mode baseline` - the mask list replaces the existing one. See the SKILL playbook for full guidance.

## Configuration

`.blazediff/config.json`:

```json
{
  "devServer": { "command": "pnpm dev", "port": 3000, "readyTimeoutMs": 60000 },
  "framework": "next",
  "packageManager": "pnpm",
  "baseUrl": "http://127.0.0.1:3000"
}
```

`.blazediff/manifest.json` is written by `capture` - never edit it directly. Each entry holds `{ id, url, mask[], viewport, waitFor, fullPage }`.

## CI

Only `check` / `run` are allowed in CI (`CI=1` or no TTY). Capture/rewrite/init/reset are explicitly blocked. Exit codes:

- `0` - all passed
- `1` - at least one regression, intentional, or pending-judgment entry
- non-zero with structured error JSON on infra failures

## Files

- `src/cli.ts` - entry point
- `src/check.ts` / `src/graph/` - single-pool and LangGraph-pipelined runners
- `src/judge/` - pluggable judge (`host` / `none`), region-tile generator, verdict applier
- `src/browser/launch.ts` - Chromium serialization + mask overlay painter
- `src/discover/` - source-walking for Next.js / Vite / Remix + BFS fallback
- `src/diff/` - heuristic verdict pipeline
- `src/report/markdown.ts` - `summary.md` generator (5-column `id | baseline | actual | diff | verdict`)
- `ROADMAP.md` - phase tracking
- Playbook: `skill/blazediff/SKILL.md` (repo root)

## Links

- [GitHub](https://github.com/teimurjan/blazediff/tree/main/packages/agent)
- [BlazeDiff docs](https://blazediff.dev/docs)
- [Roadmap](./ROADMAP.md)
