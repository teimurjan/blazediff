# BlazeDiff

Monorepo for image and object diffing libraries. Uses pnpm workspaces.

## Commands

- `pnpm build` - Build all packages (excludes website)
- `pnpm test` - Run all tests (vitest + jest)
- `pnpm typecheck` - Typecheck all packages
- `pnpm deno:test` - Run Deno smoke tests (`.deno.test.ts` per JSR package)
- `pnpm check:write` - Lint + format (biome)
- `npx @j178/prek run --all-files` - Run pre-commit hooks (biome + cargo fmt)

## Benchmarks

Build benchmarks first: `pnpm --filter @blazediff/image-benchmark build && pnpm --filter @blazediff/object-benchmark build`

### Image benchmarks

```sh
pnpm benchmark:core          # blazediff core (pixel-by-pixel)
pnpm benchmark:binary        # blazediff native binary
pnpm benchmark:odiff         # odiff comparison
pnpm benchmark:pixelmatch    # pixelmatch comparison
pnpm benchmark:ssim          # blazediff SSIM
pnpm benchmark:gmsd          # blazediff GMSD
pnpm benchmark:hitchhikers-ssim
pnpm benchmark:ssim.js       # ssim.js comparison
pnpm benchmark:weber-ssim.js # ssim.js weber comparison
```

Image fixture dirs: `pixelmatch`, `blazediff`, `4k`, `page`, `same`

### Object benchmarks

```sh
pnpm benchmark:object           # blazediff-object
pnpm benchmark:microdiff        # microdiff comparison
pnpm benchmark:opentf-obj-diff  # @opentf/obj-diff comparison
```

Object fixture names: `simple`, `nested`, `large`, `deep`, `complex`

### Filtering fixtures

Use `--fixtures` to run only specific fixtures for faster iteration:

```sh
# Image: run only pixelmatch fixtures
pnpm benchmark:core -- --fixtures=pixelmatch

# Image: run pixelmatch + blazediff fixtures
pnpm benchmark:ssim -- --fixtures=pixelmatch,blazediff

# Object: run only simple fixtures
pnpm benchmark:object -- --fixtures=simple

# Combine with fewer iterations for quick checks
pnpm benchmark:core -- --fixtures=pixelmatch --iterations=2
```

When making changes to diff algorithms, use `--fixtures` with a small subset (e.g., `pixelmatch`) and low `--iterations` for fast verification, then run the full suite before merging.

## Interpret

Module at `crates/blazediff/src/interpret/`. Part of the `blazediff` crate. Wraps `blazediff::diff()` to produce structured region analysis.

### Pipeline

```
change mask → morph close → connected components → per-region analysis → classify → describe
```

- **Don't add watershed/distance-transform** — morph close + CC is sufficient for grouping changed pixels. Watershed over-segments the known change mask.
- **Don't restructure into atomic-regions → semantic-groups → score-labels** — the 6-label decision tree is adequate. Better results come from better evidence extraction, not pipeline restructuring.

### Testing

```sh
cd crates && cargo test -p blazediff
cargo check -p blazediff --features napi  # verify N-API compiles
cargo run -p blazediff -- ../fixtures/blazediff/3a.png ../fixtures/blazediff/3b.png --interpret
```

## Dual distribution (NPM + JSR)

Every TypeScript package publishes to both NPM (via Changesets) and JSR (via `deno publish`). The native-binary sub-packages `@blazediff/core-native-*` stay NPM-only; Deno consumers resolve them through `npm:` specifiers declared in `@blazediff/core-native`'s `deno.json`.

- Per-package config lives in `packages/*/deno.json` (workspace members listed in root `deno.json`).
- `pnpm run release` chains `changeset publish` (NPM) → `publish-rust.js` (crates.io) → `publish-jsr.ts` (JSR). The JSR step is a no-op when no `deno.json` version moved.
- `scripts/publish-jsr.ts` is a Deno script (requires `deno` on PATH) — syncs `deno.json#version` from `package.json#version`, then runs `deno publish --allow-dirty`. CI authenticates via GitHub OIDC (`id-token: write`); locally it falls through to browser OAuth on first run.
- Per-package Deno smoke tests live at `packages/*/src/*.deno.test.ts`. Node's vitest/jest runners exclude them (see `configDefaults.exclude` in each vitest config and `testPathIgnorePatterns` in `packages/jest/jest.config.js`); Node's `tsc` excludes them via each package's `tsconfig.json#exclude`.
- `.vscode/settings.json` points Deno's LSP at those test files via `deno.enablePaths`, so the editor understands `jsr:` specifiers and `Deno` globals there while Node's TS LSP stays in charge everywhere else.

JSR slow-types verification: `cd packages/<x> && npx jsr publish --dry-run` — a flat workspace-root `deno check` can't satisfy the different type contexts at once (Node `Buffer` in ssim, `dom` in ui, JSX augmentation in react, jest globals in jest), so check per package.

NPM-only (not on JSR):
- `@blazediff/bun` — imports `bun:test`, which JSR's publish-time `deno check` doesn't resolve.
- `@blazediff/vitest` / `@blazediff/jest` — their purpose is to augment each runner's `Matchers` interface (`declare module "vitest"`, `declare global { namespace jest }`). JSR forbids module/global type augmentation, so these stay NPM-only.
- `@blazediff/ui` — web components have slow-types violations (implicit return type on every `static get observedAttributes`). Stay NPM-only until the components get explicit annotations.
- `@blazediff/react` — depends on `@blazediff/ui`; follows the same deferral.

## Pre-commit

Uses [prek](https://github.com/j178/prek) (`.pre-commit-config.yaml`). Hooks run automatically on `git commit`:

- **biome check** — `biome check --write` on JS/TS/JSON
- **cargo fmt** — `cargo fmt` on Rust

Run `npx @j178/prek install` after cloning to set up git hooks.
