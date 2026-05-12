# BlazeDiff Agent Rules

Monorepo for image and object diffing. pnpm workspaces. Rust core in `crates/blazediff/`, TS packages in `packages/`, agent in `packages/agent/`.

## Hard rules

- No em dashes. Anywhere. Commits, PRs, code comments, docs, chat output. Use a period, comma, parens, or colon.
- Never edit `.blazediff/manifest.json` by hand. Drive it through the agent CLI.
- Never skip pre-commit hooks (`--no-verify`, `--no-gpg-sign`). Fix the underlying issue.
- Never force-push to `main` or amend published commits.
- Keep these three in sync; edit all of them together:
  - `skill/blazediff/SKILL.md` (authoritative playbook)
  - `apps/website/app/docs/agent/page.mdx`
  - `packages/agent/README.md`
- Don't add watershed or distance-transform to the interpret pipeline. Morph close + connected components is sufficient.
- Don't restructure interpret into atomic-regions / semantic-groups / score-labels. Improve evidence extraction, not topology.
- Don't add `deno.json` to `@blazediff/core-native-*`, `@blazediff/bun`, `@blazediff/vitest`, `@blazediff/jest`, `@blazediff/ui`, `@blazediff/react`. They stay NPM-only.
- Verify JSR slow-types per package (`cd packages/<pkg> && npx jsr publish --dry-run`). Never from the workspace root.
- When iterating on diff algorithms, use `--fixtures=<small-subset>` and `--iterations=2`. Run the full suite only before merging.
- After Rust core changes, verify both feature builds: `cargo check -p blazediff --features napi` and `cargo check -p blazediff --features python`.
- JSR-only Node imports (e.g. `node:buffer` in `@blazediff/core`) live in `packages/<pkg>/jsr.patch`. Don't commit source with the patch applied; `scripts/check-jsr-patches-clean.sh` enforces this in pre-commit.

## Quick commands

- `pnpm build` (excludes website), `pnpm test`, `pnpm typecheck`, `pnpm deno:test`
- `pnpm check:write` (biome lint + format)
- `npx @j178/prek run --all-files` (full pre-commit suite)
- `cd crates && cargo test -p blazediff` (Rust core)

## Pointers

- Benchmark scripts and fixture names: `package.json` and `apps/*-benchmark/`.
- Agent design + roadmap: `packages/agent/ROADMAP.md`.
- Agent on-disk shape, mask semantics, judge handoff: `skill/blazediff/SKILL.md`.
- Rust build orchestration: `crates/blazediff/scripts/` (`_targets.sh`, `build-all.sh`, `build-napi.sh`, `build-maturin.sh`).
- Python release: `scripts/publish-pypi.js` (wheels committed to `crates/blazediff/wheels/`, CI uploads via OIDC).
- JSR release: `scripts/publish-jsr.ts` (chained after `changeset publish` in `pnpm run release`).
- Pre-commit: `.pre-commit-config.yaml` (prek). Run `npx @j178/prek install` after clone.
