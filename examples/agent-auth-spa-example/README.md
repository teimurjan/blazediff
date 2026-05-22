# `@blazediff/agent-auth-spa-example`

A small Vite + React SPA used as the live test target for
[`@blazediff/agent`](../../packages/agent)'s auth-protected route capture.
Ten routes: two public (`/`, `/about`) and eight behind a localStorage auth
gate. The login form has stable attribute selectors so the agent's harness
post-processor works out of the box.

## Run it

```sh
pnpm install
pnpm --filter @blazediff/agent-auth-spa-example dev
```

Then open <http://127.0.0.1:5173>. Any non-empty email/password pair is
accepted — this example demonstrates the agent's contract, not credential
validation.

## Run the agent against it

The package ships with `.blazediff/config.json`, `.blazediff/auth.js`, a
manifest, and committed baselines. After `pnpm install`:

```sh
export BLAZEDIFF_AUTH_DEFAULT_EMAIL=test@example.com
export BLAZEDIFF_AUTH_DEFAULT_PASSWORD=password123
pnpm --filter @blazediff/agent-auth-spa-example check
```

The agent will:

1. Start the dev server (if it isn't already up) on port 5173.
2. Capture all 10 routes — the 8 auth-gated ones run the harness in
   `.blazediff/auth.js` first.
3. Diff against the committed baselines and report `10/10 passed`.

If you unset either env var, `check` exits non-zero with a clear message
before ever launching Chromium.

## Re-generate baselines

If you intentionally change a page and want to refresh its baseline:

```sh
./node_modules/.bin/blazediff-agent serve-status --detach --json
BLAZEDIFF_AUTH_DEFAULT_EMAIL=test@example.com \
BLAZEDIFF_AUTH_DEFAULT_PASSWORD=password123 \
  ./node_modules/.bin/blazediff-agent capture \
    --routes .blazediff/_routes.json --mode baseline --json
```

`.blazediff/_routes.json` is the seed list of 10 routes used to author the
manifest. Commit the new baselines once you're satisfied with them.

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
├── config.json             # devServer + baseUrl + auth config
├── manifest.json           # 10 entries (2 auth: null, 8 auth: "default")
├── auth.js                 # login harness — env-var driven
├── _routes.json            # seed list for re-authoring
└── baselines/              # 10 committed PNGs
```

## Why this exists

The agent's auth flow is impossible to test against `apps/website` (no
login). This package gives the agent's CI and local development a real,
reproducible target that exercises the harness, the env-var contract, the
post-condition verifier, the localStorage-survives-navigation path, and the
fast-fail validation.
