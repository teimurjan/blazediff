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

2. **Playwright Chromium.** Run `blazediff-agent browsers install --check --json`. If it reports `installed: false`, run `blazediff-agent browsers install`. This uses the bundled playwright — no `npx playwright install`, no `--with-deps`, no sudo. On Linux, if the chromium binary fails to launch later due to missing system libs, the user can run `npx playwright install-deps chromium` themselves; the install itself never needs root.

3. **Skill file.** Fetch the canonical SKILL.md and write it to one of:
   - **Claude Code (project-scope, preferred when inside a git project):** `<project>/.claude/skills/blazediff/SKILL.md`
   - **Claude Code (user-wide):** `~/.claude/skills/blazediff/SKILL.md`
   - **Codex (user-wide):** `~/.codex/skills/blazediff/SKILL.md`
   - **Cursor / other:** ask the user where their custom commands or skills live.

   Source URL: `https://raw.githubusercontent.com/teimurjan/blazediff/main/skill/blazediff/SKILL.md`

   Prefer project-scope inside a git project. If the user has the BlazeDiff repo cloned locally, prefer a symlink so future updates flow through:
   ```
   ln -sf <path-to-blazediff>/skill/blazediff/SKILL.md <target>
   ```

4. **Reload** the host agent's skill list if it supports it (Claude Code: `/reload-plugins`).

5. **Final summary line.** Print exactly: `BlazeDiff installed. Try /blazediff in your agent.`

## Hard rules
- Do not invoke any `blazediff-agent` verb other than `--version`, `browsers install`, and `browsers install --check` during install.
- Do not create any `.blazediff/` directory yet. That happens when the user actually runs `/blazediff` in a project.
- Skip a step if it's already done (idempotent). Print one line per skipped step.
