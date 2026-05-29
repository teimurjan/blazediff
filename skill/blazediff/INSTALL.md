# Install BlazeDiff visual regression

Paste this file into any coding agent (Claude Code, Codex, Cursor, …) and tell it to follow the steps. It installs the `blazediff-agent` CLI and drops the `/blazediff` skill into the right place for whichever agent it's running under.

## Agent: do these in order

1. **CLI.** Install `@blazediff/agent` so the `blazediff-agent` binary is on PATH. Choose by environment:

   **(a) Published package (default):**
   - `npm i -g @blazediff/agent`
   - or `pnpm add -g @blazediff/agent` (if pnpm complains `ERR_PNPM_NO_GLOBAL_BIN_DIR`, run `pnpm setup` first)
   - or `bun add -g @blazediff/agent`

   **(b) Local clone (development):**
   ```
   cd <path-to-blazediff>/packages/agent
   pnpm install
   pnpm build
   pnpm link --global       # or `npm link`
   ```

   Either path produces a wrapper that hard-codes the active `node` binary. This matters because a manual `#!/bin/sh` shim around `/usr/bin/env node` can fail inside shell `for` loops under fnm/nvm — `pnpm link` / `npm link` doesn't have that problem.

   Verify: `blazediff-agent --version` prints `0.1.2` or later.

2. **Onboard.** Run `blazediff-agent onboard --json`. In one step it writes `.blazediff/config.json`, ensures bundled Chromium is installed (no `npx playwright install`, no `--with-deps`, no sudo — on Linux missing system libs can be fixed later with `npx playwright install-deps chromium`, which the user runs themselves), and writes the bundled playbook to the location for the active stack it detects in `cwd`:
   - **Claude Code (project-scope):** `<project>/.claude/skills/blazediff/SKILL.md`
   - **Codex (user-global):** `~/.codex/skills/blazediff/SKILL.md`
   - **Cursor (project-scope):** `<project>/.cursor/rules/blazediff.mdc` with the right frontmatter

   Under `--json` it never prompts and never captures. Force a specific subset with `--stack claude,codex,cursor` (or `--stack all`); pass `--force` to overwrite. To judge diffs locally instead of with a host agent, use `--stack local` (installs no skill file; sets `config.judge: "local"` — a two-step Moondream + Qwen pipeline). Skip the Chromium step with `--no-browsers`.

   Idempotent — re-runs report `unchanged` when the on-disk content already matches.

3. **Reload** the host agent's skill list if it supports it (Claude Code: `/reload-plugins`).

4. **Final summary line.** Print exactly: `BlazeDiff installed. Try /blazediff in your agent.`

## Hard rules
- Only use `--version` and `onboard --json` during install. Do not capture, check, or rewrite — authoring happens when the user runs `/blazediff`.
- `onboard --json` writes `.blazediff/config.json` (and ensures Chromium); it never captures under `--json`, so no baselines/manifest are created here.
- Skip a step if it's already done (idempotent). Print one line per skipped step.
