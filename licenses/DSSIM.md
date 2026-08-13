# dssim

## What it is

[dssim](https://github.com/kornelski/dssim) by Kornel Lesiński — a perceptual
image difference metric. Used in this repo **only** as a benchmark competitor,
by `crates/blazediff-ssim-benchmark`.

## License

The `dssim-core` crate is **AGPL-3.0**. BlazeDiff is MIT. AGPL-3.0 is a strong
copyleft: conveying a binary that links `dssim-core`, or making one available to
users over a network, would put its terms on the whole combined work.

## How this repo stays clear of that

- The dependency is **optional and disabled by default**
  (`dssim-core = { optional = true }`, `default = []`). A plain
  `cargo build --workspace` never resolves it into a build.
- The benchmark binary declares `required-features = ["dssim"]`, so it is
  skipped entirely unless someone opts in on the command line.
- The crate is `publish = false` and no binary built from it is distributed.
  It is a local development tool, run from source by whoever wants the numbers.

Anyone who runs `cargo run -p blazediff-ssim-benchmark --features dssim` builds
an AGPL-linked binary on their own machine. That is fine — AGPL obligations
attach on conveyance, not on private use. Do not ship that binary, and do not
enable the feature in a release build.

## Algorithms are not the licensed thing

Copyright covers dssim's source code, not the ideas its README describes
(weighted multi-scale pooling, downscaling in linear light, reduced spatial
precision for Lab a/b, mean-absolute-deviation pooling). Those are published
techniques, and implementing them from the papers or from a prose description is
not a derivative work of dssim's code — the same position taken in
[HITCHHIKERS-SSIM.md](./HITCHHIKERS-SSIM.md).

What would cross the line: transcribing dssim's Rust into BlazeDiff, or lifting
its tuned constants and weight tables verbatim. Neither has been done; no
BlazeDiff metric derives from dssim's source.
