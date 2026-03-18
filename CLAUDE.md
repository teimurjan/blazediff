# BlazeDiff

Monorepo for image and object diffing libraries. Uses pnpm workspaces.

## Commands

- `pnpm build` - Build all packages (excludes website)
- `pnpm test` - Run all tests
- `pnpm typecheck` - Typecheck all packages
- `pnpm check:write` - Lint + format (biome)

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
