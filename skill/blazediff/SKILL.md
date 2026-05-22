---
name: blazediff
description: Run, author, or update BlazeDiff visual regression tests. Trigger on "visual test", "screenshot regression", "blazediff", "/blazediff".
---

# blazediff

CLI binary is `blazediff-agent` (the name `blazediff` belongs to the cargo image-diff binary).

Sibling files in this skill directory — read on demand:
- `JUDGING.md` — judging ambiguous diffs (`pendingJudgments > 0`) + zsh-safe shell loops for writing verdicts.
- `MASKING.md` — picking selectors, mass-masking shared noise across routes, applying masks.

## Be terse
- Pass `--json` on every `blazediff-agent` call; parse fields. Do not echo CLI output.
- `check --json` returns a **slim payload**: `{ summaryPath, createdAt, totalEntries, passed, failed, pendingJudgments, results }`. `results` lists non-pass entries only, each as `{ id, url, status, verdict?: { label, headline, action } }`. The full per-entry detail (regions, paths, rationale) lives in `<TARGET>/.blazediff/summary.md` and `<TARGET>/.blazediff/judgments/<id>/request.json`.
- Authoring uses ONE `capture --stdin` call piped a JSON list of routes — never a per-route loop.
- No `ls`, `cat`, `find` for paths the CLI already returns.
- One final summary line — for authoring: `N captured | M skipped (reasons) | K auth-gated`; for check: `P/T passed (F failed)` plus failure ids.

## Pick the target directory
- If the user names a sub-folder ("test apps/website", "set up tests for packages/foo"), resolve it to an **absolute path** and pass that to every call:
  ```
  TARGET="$(cd /path/to/repo/apps/website && pwd -P)"
  blazediff-agent --cwd "$TARGET" ...
  ```
- Never pass a relative `--cwd`. Never `cd` into the target. The CLI catches the common double-nest case (`apps/website/apps/website`) but absolute paths avoid it entirely.

## Pick the mode
- `.blazediff/manifest.json` (in `--cwd`) exists → **check**.
- Else → **authoring**.

## check
1. `blazediff-agent --cwd "$TARGET" check --judge host --json` (the CLI starts the dev server if `devServer` is configured; otherwise hits the configured baseUrl directly). Capture, diff, verdict, and judge run through a LangGraph state graph so per-entry stages overlap.
   - **Cold Next.js / Vite servers** can take 5–30s to compile a route on first hit; under default 30s `page.goto` timeout the first route in a fresh dev session sometimes times out (`page.goto: Timeout 30000ms exceeded`). If that happens, **rerun the same `check` command** — the dev server is now warm and the next pass usually completes. Don't change `waitFor` or restart the dev server; the issue is one-time compilation, not a routing or wait-condition bug.
   - **Codex sandbox / restricted-bash environments** may block Playwright's chromium launch (`browserType.launch: Target page, context or browser has been closed`). Rerun with the sandbox/escape escalation the host agent provides (in Codex: approve the command for "always run outside sandbox"). Not a blazediff bug.
2. Pass: report `P/T passed`. Stop.
3. **Pending judgments** (`pendingJudgments > 0`): the heuristic couldn't classify some diffs. You are the judge — **read `JUDGING.md`** in this skill directory for the full workflow. After judging, re-run `check --apply-judgments --json`, then re-evaluate as if from step 2/4.
4. Fail: read `<TARGET>/.blazediff/summary.md` (5-column `id | baseline | actual | diff | verdict` table with inline image previews; the `--json` stdout has the same data as `CheckReport`). Each failing entry has a `verdict`: `{ label, headline, action, rationale[] }`. Emit one line per failure: `<id>: <verdict.label> — <verdict.headline>`. Then act per `verdict.label`:
   - `regression-likely` → point the user at `<TARGET>/.blazediff/actual/<id>.diff.png` and ask them to investigate. Do not rewrite.
   - `intentional-likely` → ask the user to confirm; if yes, `blazediff-agent --cwd "$TARGET" rewrite <id> --json`.
   - `noise-likely` → ask the user once: ignore, mask, or rewrite. **Prefer masking over rewriting** when the source is inherently non-deterministic (carousel, iframe, clock, randomized avatar) — rewriting only delays the next flake. See `MASKING.md`. If rewriting, group with other rewrites in one call (`rewrite <id1> <id2> ...`).
   Never rewrite or mask without explicit user confirmation.

## accept regression (rebaseline)
Use `verdict.action === "rewrite-if-intended"` (or explicit user confirmation) before calling `rewrite`. When the user confirms a failing entry's new state is correct:
- All failing entries from the last check: `blazediff-agent --cwd "$TARGET" rewrite --failed --json`
- Specific entries: `blazediff-agent --cwd "$TARGET" rewrite <id> [<id>...] --json`
- Whole manifest (rare; ask before doing this): `blazediff-agent --cwd "$TARGET" rewrite --all --json`

`rewrite` preserves the existing manifest entry's mask, viewport, waitFor, and fullPage settings — only the PNG is regenerated. After it returns, suggest the user re-run `check` to confirm and then `git add .blazediff/baselines/ && git commit`.

## reset (start from scratch)
When the user asks to wipe blazediff's state and start over (manifest stale beyond repair, switching frameworks, etc.):
- `blazediff-agent --cwd "$TARGET" reset --yes --json` — deletes the entire `.blazediff/` directory (config, manifest, baselines, actual, judgments, summary, pid/log). Tracked dev server is stopped first.
- Then re-run the full **authoring** flow below. Do not call `reset` without explicit user request — it discards committed baselines.

## authoring
1. **Config.**
   - User points at a URL ("test https://blazediff.dev", "server's running on :3001") → `blazediff-agent --cwd "$TARGET" init --url <url> --json`.
   - Local app, dev script ambiguous or wrong → `init --dev-command "<cmd>" --port <n> --json`.
   - Local app, single obvious dev script → `init --json`. On error or ambiguity, the CLI lists candidates; pick one with `--dev-script <name>`.
2. **Chromium.** `blazediff-agent browsers install --check --json`. If `installed: false`, run `blazediff-agent browsers install`. This uses the bundled playwright — no sudo, no `npx playwright install --with-deps`. (On Linux, OS-level deps for chromium may still need `npx playwright install-deps chromium` if the run fails on missing libs; tell the user.)
3. **Dev server.** If `config.devServer` is non-null, run `blazediff-agent --cwd "$TARGET" serve-status --detach --json`. **Expect this to wait up to 60s** for the port to open before returning. Do not background or poll it.
4. **Discover routes.** Prefer reading the router source directly:
   - Next.js: `app/**/page.{tsx,jsx,mdx}` + `pages/**/*.{tsx,jsx}` (skip `api/`, `_app`, `_document`, `_error`).
   - Vite + react-router: parse `<Route path=...>` in `router.{ts,tsx}`.
   - Remix / SvelteKit / Astro: walk `app/routes` or `src/routes`.

   If the framework is unknown or the router source is opaque, call `blazediff-agent --cwd "$TARGET" discover --json`. That command does a BFS crawl from the configured `baseUrl` (depth 2, up to 50 routes), reads `.next/routes-manifest.json` if present, and reads `/sitemap.xml`. It's a fallback for when source-walking fails.
5. **Filter.** Drop `/api/*`, dynamic segments without sample data, redirects/404s. For auth-gated routes, set `auth: "<persona>"` on the entry (defaults to `"default"`) — they're captured the same as public routes once the harness is in place. See **auth** below.
6. **Capture in one call.** Build a JSON array of route entries and pipe it through stdin:
   ```
   cat <<'EOF' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
   [
     {"id":"home","url":"/","mask":[".timestamp"]},
     {"id":"pricing","url":"/pricing"},
     {"id":"dashboard","url":"/dashboard","auth":"default"}
   ]
   EOF
   ```
   Entries: `{ id, url, mask?, viewport?, waitFor?, fullPage?, auth?, mode? }`. Only `id` and `url` required. `auth` is `null | "<persona>"`; legacy `"required"` is silently treated as `"default"`. Manifest entries are written automatically (pass `--no-manifest` to skip).
   - `id`: semantic kebab-case (`home`, `pricing`, `docs-getting-started`), not URL slug.
   - `mask`: CSS selectors for unstable regions (timestamps, randomized IDs, avatars, "X ago" times, carousels, third-party iframes). Omit if none. The agent always masks `[data-blazediff-agent-mask]` automatically, so prefer tagging the source element when you can edit it. See `MASKING.md` for full guidance.
7. **Teardown — ALWAYS run, even on error.** If `config.devServer` is non-null, run `blazediff-agent --cwd "$TARGET" serve-status --kill --json` as the very last step regardless of capture success/failure. The CLI kills by tracked PID first, then falls back to whatever process is listening on the configured port — so it cleans up stale dev servers from prior crashed runs too. If the kill returns `stopped: false`, no server was running; that's fine. Wrap your capture call so this step runs even if capture failed mid-list (shell `trap`, try/finally in the host agent's flow, etc.).
8. **Final summary line.** Suggest `git add .blazediff/ && git commit`.

## auth (protected routes)
Auth-gated entries run a per-project login harness before each capture. Credentials live only in env vars — never in the LLM, manifest, or harness file.

1. **Does the project already have a harness?** Check for `.blazediff/auth.js` + `auth` block in `.blazediff/config.json`. If yes, skip to step 3.
2. **One-time setup (interactive).** Tell the user to run `blazediff-agent --cwd "$TARGET" auth init --persona default --login-url <login URL>`. This opens Playwright codegen; they log in once, close the window, and the agent rewrites the typed email/password to `process.env.BLAZEDIFF_AUTH_<PERSONA>_EMAIL` / `..._PASSWORD` before writing `.blazediff/auth.js`. **Do not run `auth init` yourself in non-interactive contexts — it requires a human to drive the recorder.**
3. **Per entry.** Set `auth: "<persona>"` on the entry (use `"default"` unless the user specifies a different persona). Legacy `auth: "required"` works as an alias for `"default"`.
4. **Env vars.** Before `capture --mode baseline` or `check`, both `BLAZEDIFF_AUTH_<PERSONA>_EMAIL` and `..._PASSWORD` must be exported for every persona referenced in the manifest. `check` fails fast (no browser launch) if any are missing and tells you which.
5. **Don't try to author a harness yourself.** Form-field identification is a security-relevant decision and must stay outside the LLM. Always route the user through `auth init`.

## Hard rules
- Never `--mode baseline` an existing manifest entry without explicit user request.
- Never edit `.blazediff/manifest.json` directly.
- In CI (`CI=1` or no TTY), only `check` is allowed.
- A route that times out is logged once in the result array and skipped — never block the run.
- Never leave a dev server running after authoring exits. Teardown is mandatory on every exit path (success, capture failure, user interrupt). If you can't run teardown for some reason, tell the user the port number to kill manually.
