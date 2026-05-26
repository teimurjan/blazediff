# `@blazediff/agent-auth-spa-example`

A small Vite + React SPA used as the live test target for
[`@blazediff/agent`](../../packages/agent)'s harness-based route capture.
Ten routes: two public (`/`, `/about`) and eight behind a localStorage auth
gate. The login form has stable attribute selectors, so a login harness drives
it reliably.

## Run it

```sh
pnpm install
pnpm --filter @blazediff/agent-auth-spa-example dev
```

Then open <http://127.0.0.1:5173>. Any non-empty email/password pair is
accepted — this example demonstrates the agent's contract, not credential
validation.

## Run the agent against it

The package ships with `.blazediff/config.json`, `.blazediff/harnesses/auth.js`,
a manifest, and committed baselines. Credentials are read from env vars; the CLI
auto-loads `.blazediff/.env` (gitignored), or you can export them. After
`pnpm install`, with the dev server running on port 5173:

```sh
printf 'BLAZEDIFF_AUTH_DEFAULT_EMAIL=test@example.com\nBLAZEDIFF_AUTH_DEFAULT_PASSWORD=password123\n' \
  > examples/agent-auth-spa-example/.blazediff/.env
pnpm --filter @blazediff/agent-auth-spa-example check
```

The agent will:

1. Capture all 10 routes — the 8 auth-gated ones run the `auth` setup harness
   (`.blazediff/harnesses/auth.js`) before navigating, attached per entry via
   `harnesses: [{ "name": "auth", "params": { "persona": "default" } }]`.
2. Diff against the committed baselines and report `10/10 passed`.

If either env var is missing, the harness throws a clear error at capture time.

## Re-generate baselines

If you intentionally change a page and want to refresh its baseline, re-run the
capture through the manifest (this re-runs the auth harness automatically):

```sh
./node_modules/.bin/blazediff-agent serve-status --detach --json
./node_modules/.bin/blazediff-agent rewrite --all --json   # or: rewrite <id> [<id>...]
./node_modules/.bin/blazediff-agent serve-status --kill --json
```

`rewrite` preserves each entry's mask/viewport/waitFor/fullPage/harnesses and
only regenerates the PNGs. Commit the new baselines once you're satisfied.

## Layout

```
src/
├── App.tsx                 # router (10 routes + /login + 404)
├── auth.ts                 # localStorage helpers
├── components/
│   ├── Layout.tsx          # sidebar shell
│   ├── ProtectedRoute.tsx  # auth gate (redirects to /login)
│   └── PageHeader.tsx
├── pages/                  # 11 deterministic page components
└── styles.css              # Tailwind v4 entry
.blazediff/
├── config.json             # devServer + baseUrl
├── manifest.json           # 10 entries (2 public, 8 with the auth harness)
├── harnesses/
│   └── auth.js             # login harness (phase: "setup") — env-var driven
├── .env                    # creds (gitignored; auto-loaded)
└── baselines/              # 10 committed PNGs
```

## Why this exists

The agent's harness flow is impossible to test against `apps/website` (no
login). This package gives the agent's CI and local development a real,
reproducible target that exercises the login harness, the env-var contract,
the in-harness post-login check, and the localStorage-survives-navigation path.
