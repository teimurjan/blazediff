# @blazediff/agent

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fagent?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/agent)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fagent?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/agent)

</div>

Visual regression testing your coding agent can judge. Discovers routes, screenshots them with Playwright, diffs against committed baselines, and hands ambiguous diffs to Claude Code, Codex, or Cursor as compact region tiles, not full PNGs. Deterministic CLI, no embedded LLM, no API key.

**Features:**
- Deterministic CLI. No embedded LLM, no API key required
- Source-walking route discovery for Next.js / Vite / Remix (BFS fallback)
- Heuristic verdict: `regression-likely | intentional-likely | noise-likely | ambiguous`
- LangGraph pipeline with per-entry subgraphs, suspendable via `interrupt()` and resumable from an on-disk checkpoint
- Region-tile handoff to host agents (10 to 100x smaller than full PNGs)
- Auto-masking via `data-blazediff-agent-mask` attribute
- Auth-protected route capture via a codegen-recorded login harness; credentials live in env vars, never in LLM context

## Installation

```bash
npm install --save-dev @blazediff/agent
```

## Quickstart

```bash
blazediff-agent onboard                    # interactive: config + chromium + playbook + baselines
blazediff-agent check --judge host         # CI: re-capture, diff, judge
blazediff-agent rewrite home               # accept an intentional change
```

`onboard` writes `.blazediff/config.json`, installs bundled Chromium, installs the
playbook for your coding agent, and offers to capture baselines on the spot. The
second command (`check`, or `capture` if you declined the baseline offer) starts
capturing. Commit `.blazediff/` (config + manifest + baselines). All commands
accept `--json`; under `--json`/CI, `onboard` runs non-interactively (no prompts,
no capture) — a scriptable config + chromium step.

## Commands

<table>
  <tr><th width="200">Command</th><th>Description</th></tr>
  <tr><td><code>onboard</code></td><td>Interactive setup: write <code>.blazediff/config.json</code>, install Chromium, install the playbook for your stack (Claude Code / Codex / Cursor, or <code>local</code> for a Moondream + Qwen judge), and optionally capture baselines</td></tr>
  <tr><td><code>discover</code></td><td>BFS-crawl routes from <code>baseUrl</code></td></tr>
  <tr><td><code>capture --stdin</code></td><td>Screenshot routes from stdin JSON, write baselines/actuals</td></tr>
  <tr><td><code>check</code></td><td>Re-capture, diff against baseline, emit <code>CheckReport</code>. Judge backend defaults to <code>config.judge</code> (set by <code>onboard</code>), overridable with <code>--judge host|none|local</code>. <code>--judge host</code> suspends on the first ambiguous entry (<code>--apply-judgments</code> resumes once verdicts are written); <code>--judge local</code> judges inline with local models (Moondream describes, Qwen classifies) — no host round-trip.</td></tr>
  <tr><td><code>rewrite &lt;id...&gt;</code></td><td>Re-baseline existing entries (also <code>--failed</code> / <code>--all</code>). Cleans stale <code>actual/</code>, <code>judgments/</code>, <code>report.json</code>, <code>checkpoints/</code> for the rewritten ids.</td></tr>
  <tr><td><code>diff &lt;id&gt;</code></td><td>Re-diff one entry without re-screenshotting</td></tr>
  <tr><td><code>manifest</code></td><td>Inspect / list manifest entries</td></tr>
  <tr><td><code>harness record &lt;name&gt;</code></td><td>Record an interaction via Playwright codegen into <code>.blazediff/harnesses/&lt;name&gt;.js</code>. <code>--login</code> rewrites typed credentials to env-var refs</td></tr>
  <tr><td><code>serve-status</code></td><td>Start / stop / probe the dev server</td></tr>
  <tr><td><code>browsers install</code></td><td>Install bundled Playwright Chromium</td></tr>
  <tr><td><code>reset --yes</code></td><td>Wipe <code>.blazediff/</code></td></tr>
</table>

Pass `--cwd <abs-path>` to target a sub-package in a monorepo.

## Onboard options

`onboard` auto-detects your coding agent; override or scope the playbook with `--stack`:

```bash
blazediff-agent onboard --stack codex      # explicit
blazediff-agent onboard --stack all        # claude + codex + cursor
blazediff-agent onboard --stack local      # local judge, no host agent (Moondream + Qwen)
blazediff-agent onboard --no-browsers --no-capture   # config + playbook only
```

Other flags: `--url <baseUrl>` (external/running server), `--dev-command <cmd>` /
`--port <n>` / `--dev-script <name>` (override detection), `--yes` (accept prompts),
`--force` (rewrite config + playbook).

For coding-agent stacks, writes the playbook and sets `config.judge: "host"`:
- Claude Code → `<project>/.claude/skills/blazediff/SKILL.md`
- Codex → `~/.codex/skills/blazediff/SKILL.md`
- Cursor → `<project>/.cursor/rules/blazediff.mdc`

`--stack local` writes no skill file. It sets `config.judge: "local"` so `check`
judges diffs locally in two steps: Moondream 2 describes the change, then
Qwen3.5-0.8B classifies it using that description plus the deterministic
`interpret` summary (both via the optional peer dependency
`@huggingface/transformers`; install it with `npm i @huggingface/transformers`).
Each model loads once on the first judgment and is reused for the rest of the run.
`local` cannot be combined with the coding-agent stacks.

## Masking

Mark non-deterministic content (carousels, clocks, randomized avatars) in source:

```tsx
<div data-blazediff-agent-mask>...</div>
<div data-blazediff-agent-mask="report-carousel">...</div>
```

For third-party embeds you can't annotate, use a per-entry `manifest.entries[].mask` CSS selector and re-capture.

## Judging

Every non-match routes through the configured judge. With `--judge host` the judge node `interrupt()`s the LangGraph pipeline, writes a `JudgmentRequest` (region tiles + locator thumbnail) to `.blazediff/judgments/<id>/`, and the suspended graph is checkpointed to `.blazediff/checkpoints/`. The host agent reads the tiles, writes `verdict.json`, and `check --apply-judgments` resumes the same graph with the verdicts. No re-capture, no re-diff.

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

`.blazediff/manifest.json` is written by `capture`; don't edit it directly.

## Harnesses

A harness is a pluggable script in `.blazediff/harnesses/<name>.js`, attached to
an entry via `harnesses: [{ name, params? }]`. A **setup** harness runs before
navigation (e.g. login); an **interact** harness (the default) runs after the
base screenshot and may drive the page and emit extra named screenshots — each
becomes its own baseline entry (`<id>__<name>`). Harnesses default-export a
`Harness` and are ESM `.js`/`.mjs` (TypeScript is not auto-transpiled):

```js
/** @type {import("@blazediff/agent").Harness} */
export default {
  async run({ page, screenshot }) {
    await page.getByRole("button", { name: "More options" }).click();
    await screenshot("menu"); // -> baseline "<entry>__menu"
  },
};
```

### Auth-protected routes

Login is just a `phase:"setup"` harness. For a simple form login, the agent writes
`.blazediff/harnesses/auth.js` directly — a `goto(/login)` → fill from
`process.env.BLAZEDIFF_AUTH_<PERSONA>_EMAIL` / `..._PASSWORD` → submit → assert it
left `/login`. No credentials ever live in the file, only env refs. For flows it
can't author (OAuth/SSO, MFA, captcha), `blazediff-agent harness record auth --login`
records the login interactively via Playwright codegen and rewrites the typed creds
to env refs.

Attach it with `"harnesses": [{ "name": "auth", "params": { "persona": "default" } }]`,
then put `BLAZEDIFF_AUTH_<PERSONA>_EMAIL` / `..._PASSWORD` in an env file the CLI
auto-loads from the target dir — `.blazediff/.env[.local]` (blazediff-scoped,
auto-gitignored) or the project-root `.env[.local]` — or export them. Real env
wins; `.blazediff/` files beat the root. `check` does the rest.
Full walkthrough: [Auth-protected routes][auth-docs].

[auth-docs]: https://blazediff.dev/docs/agent#auth-protected-routes

## CI

Only `check` is allowed under `CI=1`. Exit codes:

- `0`: all passed
- `1`: regression, intentional, or pending judgment
- non-zero with structured error JSON on infra failures

## Links

- [GitHub](https://github.com/teimurjan/blazediff/tree/main/packages/agent)
- [Documentation](https://blazediff.dev/docs/agent)
