---
name: blazediff
description: Run, author, or update BlazeDiff visual regression tests. Trigger on "visual test", "screenshot regression", "blazediff", "/blazediff".
---

# blazediff

CLI binary is `blazediff-agent` (the name `blazediff` belongs to the cargo image-diff binary).

## Be terse
- Pass `--json` on every `blazediff-agent` call; parse fields. Do not echo CLI output.
- `check`/`run --json` returns a **slim payload**: `{ summaryPath, createdAt, totalEntries, passed, failed, pendingJudgments, results }`. `results` lists non-pass entries only, each as `{ id, url, status, verdict?: { label, headline, action } }`. The full per-entry detail (regions, paths, rationale) lives in `<TARGET>/.blazediff/summary.md` and `<TARGET>/.blazediff/judgments/<id>/request.json`.
- Authoring uses ONE `capture --stdin` call piped a JSON list of routes — never a per-route loop.
- No `ls`, `cat`, `find` for paths the CLI already returns.
- One final summary line — for authoring: `N captured | M skipped (reasons) | K auth-gated`; for check: `P/T passed (F failed)` plus failure ids.
- If you must loop in shell (e.g., to construct the JSON list), use POSIX `while IFS= read` or a heredoc into Python/node. Never `declare -A` (bash-only, breaks under zsh).

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
1. `blazediff-agent --cwd "$TARGET" check --judge host --json` (the CLI starts the dev server if `devServer` is configured; otherwise hits the configured baseUrl directly).
   - Prefer `run` instead for large sites (≥10 routes): `blazediff-agent --cwd "$TARGET" run --judge host --json`. Same flags, same report shape — it just pipelines capture → diff → verdict → judge through a LangGraph state graph so per-entry stages overlap. Use `check` when you want the simpler, single-pool implementation; `run` when wall-time matters or you want LangSmith traces.
2. Pass: report `P/T passed`. Stop.
3. **Pending judgments** (`pendingJudgments > 0`): the heuristic couldn't classify some diffs. You are the judge — see "judge ambiguous diffs" below. After judging, re-run `check --apply-judgments --json`, then re-evaluate as if from step 2/4.
4. Fail: read `<TARGET>/.blazediff/summary.md` (5-column `id | baseline | actual | diff | verdict` table with inline image previews; the `--json` stdout has the same data as `CheckReport`). Each failing entry has a `verdict`: `{ label, headline, action, rationale[] }`. Emit one line per failure: `<id>: <verdict.label> — <verdict.headline>`. Then act per `verdict.label`:
   - `regression-likely` → point the user at `<TARGET>/.blazediff/actual/<id>.diff.png` and ask them to investigate. Do not rewrite.
   - `intentional-likely` → ask the user to confirm; if yes, `blazediff-agent --cwd "$TARGET" rewrite <id> --json`.
   - `noise-likely` → ask the user once: ignore, mask, or rewrite. **Prefer masking over rewriting** when the source is inherently non-deterministic (carousel, iframe, clock, randomized avatar) — rewriting only delays the next flake. See "mask (suppress unstable regions)" below. If rewriting, group with other rewrites in one call (`rewrite <id1> <id2> ...`).
   Never rewrite or mask without explicit user confirmation.

## judge ambiguous diffs
When `check --judge host` reports `pendingJudgments > 0`, the heuristic returned `ambiguous` for those entries and is deferring to you. For each `<TARGET>/.blazediff/judgments/<id>/`:

> **Token discipline — read regions, not the page.** `regions.png` is a tight crop of every changed area at native resolution; `locator.png` is a ~400 px overview thumbnail. Together they're typically 10–100x smaller than the full baseline/actual/diff PNGs and contain everything needed to judge the change. **Never** open `paths.baseline` / `paths.actual` / `paths.diff` as a first move — they are full-page fallbacks for the rare case where a region clearly continues outside its crop (e.g., a layout shift that runs off the bottom of the tile). For "is something wrong with this screenshot?" investigations of any kind, default to regions first.

1. Read `request.json`. It contains `regions[]` (bbox + pixelCount + change type per region), `paths.locator`, `paths.tiles`, `heuristicVerdict`, and full `manifestEntry` context. The `paths.baseline` / `paths.actual` / `paths.diff` fields are full-page fallbacks — prefer the tiles.
2. **Batch-read `locator.png` and `regions.png` in a single tool call** (one message with two parallel Read invocations). `locator.png` is a ~400 px thumbnail of the diff with every change region outlined in red — use it for spatial orientation. `regions.png` is a vertical stack of `[baseline | actual]` pairs, one row per change region at native resolution. Row order matches the `regions[]` array (top = largest by pixelCount). When multiple pending entries exist, batch reads across entries too — every Read in one tool call.
3. Base your verdict primarily on what `regions.png` shows. Only open the full diff / baseline / actual PNGs (`paths.diff` etc., relative to the target) if the composite is itself ambiguous (e.g., a change clearly continues outside the cropped region).
4. Write `<TARGET>/.blazediff/judgments/<id>/verdict.json` (next to the request.json) with shape:
   ```json
   {
     "id": "<same id>",
     "verdict": {
       "label": "regression-likely" | "intentional-likely" | "noise-likely",
       "headline": "<one-line summary>",
       "rationale": ["<short reason>", "..."],
       "action": "investigate" | "rewrite-if-intended" | "ignore-or-rewrite"
     },
     "rationale": "<one-paragraph explanation of what you saw>",
     "confidence": 0.0
   }
   ```
   Pick `action` to match `label`: `regression-likely` → `investigate`, `intentional-likely` → `rewrite-if-intended`, `noise-likely` → `ignore-or-rewrite`.
5. Run `blazediff-agent --cwd "$TARGET" check --apply-judgments --json`. The CLI regenerates `summary.md` from your verdicts (no re-screenshot).
6. Resume the check flow with the upgraded verdicts.

## mask (suppress unstable regions)
When a diff is `noise-likely`, or when a `regression-likely`/`intentional-likely` diff is actually caused by something inherently non-deterministic in the page, the right fix is usually a **mask**, not a rebaseline. A rebaseline just resets the clock on a flake; a mask removes it.

**Mask whenever the changing region is:**
- An auto-cycling animation: carousels, marquees, demo widgets with `setInterval`, video posters, Lottie loops.
- A third-party iframe or embed: Storybook, YouTube, Twitter, codesandbox, Stripe checkout — anything whose load timing or content you don't control. `networkidle` does not wait for embedded iframes' subresources to finish.
- Time-derived content: `Date.now()` clocks, "X minutes ago" timestamps, today-highlighted calendars, expiry countdowns, copyright years on Dec 31 / Jan 1.
- Per-session randomness: avatars seeded from session id, A/B-test variants, generated IDs, shuffled lists.
- Anti-bot / personalization noise: cookie banners that load asynchronously, recommendation strips, geolocation-derived prices.

**Don't mask** real content that just happens to be changing — that's the change you want the test to catch. If unsure: mask only after you've seen the same region flake twice, or after you've confirmed the source is inherently non-deterministic (e.g., grep'd for `setInterval` / `<iframe` / `Date.now()` in the component).

**Picking a selector.** Masks are CSS selectors passed to `document.querySelectorAll`, then painted with a magenta rect over the bounding rect in both baseline and actual.
- Prefer a stable, intent-revealing attribute: add `data-blazediff-mask="<reason>"` to the component root in source and select `[data-blazediff-mask="<reason>"]`. Survives refactors, documents intent inline.
- For external/third-party embeds you can't annotate, target the element type: `iframe`, `video`, `[data-testid="storybook-preview"]`.
- Avoid Tailwind class chains and nth-child selectors — they break on the next style tweak.
- Scope matters: each manifest entry has its own `mask` array, so `iframe` on `/examples/web-components` won't affect `/home`. Use the narrowest selector that covers the unstable region.

**Applying a mask** (re-baselines the entry; treat as user-confirmed when the user said "mask"):
1. If you need a new selector, edit the component source to add `data-blazediff-mask="<reason>"` (or equivalent). Keep the attribute name stable; it's now load-bearing for the test.
2. Re-capture the affected entries in a single call, passing the new mask list. `capture --stdin --mode baseline` rewrites both the manifest mask and the baseline PNG:
   ```
   cat <<'EOF' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
   [
     {"id":"agent","url":"/agent","mask":["[data-blazediff-mask=\"report-cycling\"]"]},
     {"id":"examples-web-components","url":"/examples/web-components","mask":["iframe"]}
   ]
   EOF
   ```
   The mask list **replaces** the existing one — include every selector you want kept, not just the new one. To inspect the current mask, grep the manifest (read-only).
3. Re-run `run` / `check` to confirm the entry now passes. If it still fails, the selector didn't match anything — verify with the browser devtools on the live page.
4. If `config.devServer` is non-null and you started it for the recapture, `serve-status --kill --json` afterwards.

Don't mask globally in `defaults` unless the unstable element appears on every route (e.g., a sitewide cookie banner). Per-entry masks keep the blast radius small.

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
5. **Filter.** Drop `/api/*`, dynamic segments without sample data, redirects/404s. Flag auth-gated as `auth: required` (record in manifest, don't capture).
6. **Capture in one call.** Build a JSON array of route entries and pipe it through stdin:
   ```
   cat <<'EOF' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
   [
     {"id":"home","url":"/","mask":[".timestamp"]},
     {"id":"pricing","url":"/pricing"}
   ]
   EOF
   ```
   Entries: `{ id, url, mask?, viewport?, waitFor?, fullPage?, mode? }`. Only `id` and `url` required. Manifest entries are written automatically (pass `--no-manifest` to skip).
   - `id`: semantic kebab-case (`home`, `pricing`, `docs-getting-started`), not URL slug.
   - `mask`: CSS selectors for unstable regions (timestamps, randomized IDs, avatars, "X ago" times, carousels, third-party iframes). Omit if none. See "mask (suppress unstable regions)" for selector-picking guidance.
7. **Teardown — ALWAYS run, even on error.** If `config.devServer` is non-null, run `blazediff-agent --cwd "$TARGET" serve-status --kill --json` as the very last step regardless of capture success/failure. The CLI kills by tracked PID first, then falls back to whatever process is listening on the configured port — so it cleans up stale dev servers from prior crashed runs too. If the kill returns `stopped: false`, no server was running; that's fine. Wrap your capture call so this step runs even if capture failed mid-list (shell `trap`, try/finally in the host agent's flow, etc.).
8. **Final summary line.** Suggest `git add .blazediff/ && git commit`.

## Hard rules
- Never `--mode baseline` an existing manifest entry without explicit user request.
- Never edit `.blazediff/manifest.json` directly.
- In CI (`CI=1` or no TTY), only `check` is allowed.
- A route that times out is logged once in the result array and skipped — never block the run.
- Never leave a dev server running after authoring exits. Teardown is mandatory on every exit path (success, capture failure, user interrupt). If you can't run teardown for some reason, tell the user the port number to kill manually.
