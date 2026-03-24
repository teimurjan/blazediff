# blazediff

High-performance image diffing with block-based optimization and SIMD acceleration.

[![Crates.io](https://img.shields.io/crates/v/blazediff.svg)](https://crates.io/crates/blazediff)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Block-based optimization** - Skip identical regions for massive speedups on similar images
- **SIMD acceleration** - Native SSE4.1 (x86) and NEON (ARM) implementations
- **Multiple formats** - PNG, JPEG, and QOI support
- **Perceptual diffing** - YIQ-based color difference with antialiasing detection
- **Cross-platform** - Linux, macOS, and Windows support

## Installation

```bash
cargo install blazediff
```

## CLI Usage

```bash
# Basic diff
blazediff image1.png image2.png -o diff.png

# With custom threshold (0.0 - 1.0)
blazediff image1.png image2.png -o diff.png -t 0.1

# JSON output for scripting
blazediff image1.png image2.png --json
```

## Library Usage

```rust
use blazediff::{diff, DiffOptions};

let options = DiffOptions {
    threshold: 0.1,
    include_anti_aliased: false,
    ..Default::default()
};

let result = diff("image1.png", "image2.png", Some("diff.png"), &options)?;
println!("Different pixels: {}", result.diff_count);
```

## Interpret

Structured region analysis that takes a raw pixel diff and produces human-readable change descriptions. Available via `--interpret` in the CLI or `interpret()` in the library.

See [INTERPRET.md](./INTERPRET.md) for the full algorithm documentation — pipeline stages, formulas, classification rules, and output format.

## Performance

3-4x faster than odiff, 8x faster than pixelmatch on 4K images.

## License

MIT
