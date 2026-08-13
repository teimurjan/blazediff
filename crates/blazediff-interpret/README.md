# blazediff-interpret

Structured region analysis for image diffs. Given two images and a set of changed regions, it
says *what* changed in each one — not just where.

```rust
use blazediff_interpret::{interpret_regions, types::BoundingBox};

let result = interpret_regions(&expected, &actual, &regions)?;
println!("{}", result.summary);
for region in &result.regions {
    println!("{:?} at {} ({:.2}%)", region.change_type, region.position, region.percentage);
}
```

## Why it's a separate crate

The classifier is deliberately independent of whatever *found* the regions. Three producers feed
it today:

| Producer | How it finds regions |
| --- | --- |
| [`blazediff`](https://crates.io/crates/blazediff) | connected components over a pixel-diff mask |
| [`blazediff-ssim`](https://crates.io/crates/blazediff-ssim) | thresholding a local SSIM score map |
| your code | DOM rectangles, a JS-side diff, a crop list — anything |

`blazediff` already depends on `blazediff-ssim`, so a classifier living in either would be
unreachable from the other. It sits below both instead.

## Coarse regions are fine

A producer only has to know roughly where something changed. Before any statistic is computed,
the supplied boxes are refined against the source pixels — every pixel whose YIQ delta falls
below the noise floor is dropped — so shape, colour and gradient analysis stay per-pixel no
matter how blocky the input was:

```rust
// An 8x8 change, described exactly and then quantized to a 16px grid.
let exact  = interpret_regions(&a, &b, &[BoundingBox { x: 16, y: 16, width: 8,  height: 8  }])?;
let coarse = interpret_regions(&a, &b, &[BoundingBox { x: 16, y: 16, width: 16, height: 16 }])?;
assert_eq!(coarse.diff_count, exact.diff_count); // both 64
```

That is what makes an SSIM window map a usable region source: its grid is coarse, but the
statistics derived from it are not. `diff_count` therefore means the same thing on every path —
actually-changed pixels, never windows.

## API

| Item | Purpose |
| --- | --- |
| `interpret_regions` | regions in, full `InterpretResult` out — summary, severity, classified regions |
| `classify_region` / `classify_regions` | classify against a mask you already hold |
| `detect_regions` | connected components over a boolean mask |
| `extract_change_mask` | recover a mask from an RGBA diff visualization |
| `detect_shifts` | the shift-relabeling pass, for producers holding an exact mask |
| `classify_severity`, `build_summary` | the pooling steps, exposed for custom pipelines |

Regions arriving from a caller are validated: a box outside the image is an
`InterpretError::RegionOutOfBounds`, not an out-of-bounds panic. That matters now that regions
cross the wasm and N-API boundaries.

## What it classifies

Each region gets a change type, a shape, a position, a confidence, and the statistics behind
them — colour delta, gradient/edge correlation, fill ratios, and the signals the classifier used.
See [INTERPRET.md](https://github.com/teimurjan/blazediff/blob/main/crates/blazediff/INTERPRET.md)
for the full algorithm: pipeline stages, formulas, and classification rules.

## License

MIT
