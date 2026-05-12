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

## Default attribute (no manifest changes)

The agent always masks any element matching `[data-blazediff-agent-mask]`. No selector needs to be added to the manifest entry. This is the preferred path whenever you can edit the source.

```tsx
<div data-blazediff-agent-mask>...</div>
// or, with a reason inline:
<div data-blazediff-agent-mask="report-carousel">...</div>
```

The attribute's value is ignored by the matcher; presence is enough. Use the value to document intent for future readers.

When the default attribute covers the unstable region, leave the manifest entry's `mask: []` and skip the rest of this file.

## Picking a selector (for cases you can't annotate)

Per-entry `mask` selectors still exist for cases where you can't edit the source (third-party iframes, transient build artifacts, components owned by another team). They're CSS selectors passed to `document.querySelectorAll`, painted with a magenta rect over the bounding rect in both baseline and actual.

- For external/third-party embeds, target the element type: `iframe`, `video`, `[data-testid="storybook-preview"]`.
- Avoid Tailwind class chains and nth-child selectors. They break on the next style tweak.
- Scope matters. Each manifest entry has its own `mask` array, so `iframe` on `/examples/web-components` won't affect `/home`. Use the narrowest selector that covers the unstable region.
- If you find yourself reaching for a per-entry selector because the source is yours, prefer the `data-blazediff-agent-mask` attribute instead. Zero manifest churn, survives refactors.

## Mass-masking shared noise

When the same unstable region appears across many routes (a footer "Last updated" stamp, a global theme toggle, a sitewide cookie banner), don't write a per-entry mask N times. The single best move is to add `data-blazediff-agent-mask` to the shared component (layout, header, footer, doc-framework template). The default matcher catches it on every route automatically. No manifest edits.

```tsx
<footer>
  Last updated <span data-blazediff-agent-mask>{date}</span>
</footer>
```

After tagging the source, re-capture the affected routes so baselines reflect the new mask:

```sh
TARGET="$(cd /abs/path && pwd -P)"
# Build the entries list from the ids you saw in pendingJudgments (or results[] if already judged)
python3 -c '
import json
ids = """docs docs-bun docs-cli docs-core docs-jest docs-react""".split()
url_map = {
  "docs": "/docs", "docs-bun": "/docs/bun", "docs-cli": "/docs/cli",
  "docs-core": "/docs/core", "docs-jest": "/docs/jest", "docs-react": "/docs/react",
}
print(json.dumps([{"id": i, "url": url_map[i]} for i in ids]))
' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
```

Re-run `check` / `run`. The pending count should collapse from N to 0 (or to a much smaller distinct set).

If the shared element is third-party (can't be annotated), fall back to a per-entry selector mask and pass `mask: ["iframe"]` (or whatever fits) in the capture JSON.

## Applying a mask

(Re-baselines the entry; treat as user-confirmed when the user said "mask".)

1. If you can edit the source, add `data-blazediff-agent-mask` to the unstable element. No manifest changes are needed; the default matcher handles it.
2. If you can't edit the source (third-party iframe, framework-owned element), prepare a per-entry CSS selector. Pass the new mask list to `capture --stdin --mode baseline`, which rewrites both the manifest mask and the baseline PNG:
   ```
   cat <<'EOF' | blazediff-agent --cwd "$TARGET" capture --stdin --mode baseline --json
   [
     {"id":"examples-web-components","url":"/examples/web-components","mask":["iframe"]}
   ]
   EOF
   ```
   The mask list replaces the existing one. Include every selector you want kept, not just the new one. To inspect the current mask, grep the manifest (read-only).
3. Re-run `run` / `check` to confirm the entry now passes. If it still fails, the attribute or selector didn't match anything. Verify in browser devtools on the live page.
4. If `config.devServer` is non-null and you started it for the recapture, `serve-status --kill --json` afterwards.

The default attribute is preferred when you own the source. Per-entry CSS selectors keep the blast radius small when you don't.
