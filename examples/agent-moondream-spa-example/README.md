# `@blazediff/agent-moondream-spa-example`

A small Vite + React SPA used as the live test target for
[`@blazediff/agent`](../../packages/agent)'s **local Moondream judge**. Five
public routes (`/`, `/pricing`, `/docs`, `/changelog`, `/status`), no auth — the
point here is the judge backend, not the capture flow.

Unlike the [auth example](../agent-auth-spa-example) (which defers judging to a
host coding agent), this package's `.blazediff/config.json` sets
`"judge": "moondream"`, so `check` classifies any visual diff **locally** with
Moondream 2 — no host round-trip, no `interrupt()`.

## Run it

```sh
pnpm install
pnpm --filter @blazediff/agent-moondream-spa-example dev
```

Then open <http://127.0.0.1:5273>. Everything is hard-coded and animation-free,
so baselines stay byte-stable across machines and CI runners.

## Run the agent against it

The package ships with `.blazediff/config.json`, a manifest, and committed
baselines. The local judge needs the optional peer dependency
`@huggingface/transformers` (already listed as a devDependency here). With the
dev server running on port 5273:

```sh
pnpm --filter @blazediff/agent-moondream-spa-example check
```

`check` reads `config.judge: "moondream"`, captures all 5 routes, and diffs them
against the baselines. On a clean run it reports `5/5 passed` and **never loads
the model** — Moondream only spins up when a region actually differs. The model
loads once on the first ambiguous diff and is reused for the rest of the run.

To see the judge fire, tweak a page (e.g. change a heading in
`src/pages/Home.tsx`) and re-run `check`: the first download pulls the
`Xenova/moondream2` weights, then the judge labels the diff
`regression-likely` / `intentional-likely` / `noise-likely` inline.

You can override the backend per run with `--judge none|host|moondream`.

## Re-generate baselines

If you intentionally change a page and want to refresh its baseline:

```sh
./node_modules/.bin/blazediff-agent serve-status --detach --json
./node_modules/.bin/blazediff-agent rewrite --all --json   # or: rewrite <id> [<id>...]
./node_modules/.bin/blazediff-agent serve-status --kill --json
```

Commit the new baselines once you're satisfied.

## Layout

```
src/
├── App.tsx                 # router (5 routes + 404)
├── components/
│   ├── Layout.tsx          # top-navbar shell (indigo theme)
│   └── PageHeader.tsx
├── pages/                  # Home, Pricing, Docs, Changelog, Status, NotFound
└── styles.css              # Tailwind v4 entry
.blazediff/
├── config.json             # devServer + baseUrl + judge: "moondream"
├── manifest.json           # 5 public entries (no harnesses)
└── baselines/              # 5 committed PNGs
```

## Why this exists

The auth example exercises the harness/host-judge path. This one exercises the
opposite end: a fully local, deterministic judge that runs inference inside the
agent. It gives the Moondream backend a real, reproducible target for CI and
local development.
