# blazediff — masking unstable regions

When a diff is `noise-likely`, or when a `regression-likely`/`intentional-likely` diff is actually caused by something inherently non-deterministic in the page, the right fix is usually a **mask**, not a rebaseline. A rebaseline just resets the clock on a flake; a mask removes it.

## When to mask

**Mask whenever the changing region is:**
- An auto-cycling animation: carousels, marquees, demo widgets with `setInterval`, video posters, Lottie loops.
- A third-party iframe or embed: Storybook, YouTube, Twitter, codesandbox, Stripe checkout — anything whose load timing or content you don't control. `networkidle` does not wait for embedded iframes' subresources to finish.
- Time-derived content: `Date.now()` clocks, "X minutes ago" timestamps, today-highlighted calendars, expiry countdowns, copyright years on Dec 31 / Jan 1.
- Per-session randomness: avatars seeded from session id, A/B-test variants, generated IDs, shuffled lists.
- Anti-bot / personalization noise: cookie banners that load asynchronously, recommendation strips, geolocation-derived prices.

**Don't mask** real content that just happens to be changing — that's the change you want the test to catch. If unsure: mask only after you've seen the same region flake twice, or after you've confirmed the source is inherently non-deterministic (e.g., grep'd for `setInterval` / `<iframe` / `Date.now()` in the component).

## Picking a selector

Masks are CSS selectors passed to `document.querySelectorAll`, then painted with a magenta rect over the bounding rect in both baseline and actual.
- Prefer a stable, intent-revealing attribute: add `data-blazediff-mask="<reason>"` to the component root in source and select `[data-blazediff-mask="<reason>"]`. Survives refactors, documents intent inline.
- For external/third-party embeds you can't annotate, target the element type: `iframe`, `video`, `[data-testid="storybook-preview"]`.
- Avoid Tailwind class chains and nth-child selectors — they break on the next style tweak.
- Scope matters: each manifest entry has its own `mask` array, so `iframe` on `/examples/web-components` won't affect `/home`. Use the narrowest selector that covers the unstable region.

## Mass-masking shared noise

When the same unstable region appears across many routes (a footer "Last updated" stamp, a global theme toggle, a sitewide cookie banner), don't write a per-entry mask N times. Instead:

1. Find the source — the component that renders the unstable element. It's almost always in a shared layout, header, footer, or doc-framework template, not in the per-route page file.
2. Add `data-blazediff-mask="<reason>"` to that one component.
3. Re-capture **every affected route** in a single `capture --stdin --mode baseline` call, passing the same mask selector to all of them. Build the JSON list from the ids you saw in `pendingJudgments` (or `results[]` if already judged):
   ```sh
   TARGET="$(cd /abs/path && pwd -P)"
   # build entries list from the failed/pending ids
   python3 -c '
   import json,sys
   ids = """docs docs-bun docs-cli docs-core docs-jest docs-react""".split()
   url_map = {  # match the ids to their /docs/* urls (or read from manifest.json)
     "docs": "/docs", "docs-bun": "/docs/bun", "docs-cli": "/docs/cli",
     "docs-core": "/docs/core", "docs-jest": "/docs/jest", "docs-react": "/docs/react",
   }
   mask = ["[data-blazediff-mask=\"last-updated\"]"]
   print(json.dumps([{"id": i, "url": url_map[i], "mask": mask} for i in ids]))
   ' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
   ```
4. Re-run `check` / `run`. The pending count should collapse from N to 0 (or to a much smaller distinct set).

## Applying a mask

(Re-baselines the entry; treat as user-confirmed when the user said "mask".)

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
