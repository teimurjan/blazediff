# blazediff

High-performance image diffing with block-based optimization and SIMD acceleration.

[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=for-the-badge)](https://crates.io/crates/blazediff)
[![npm](https://img.shields.io/npm/v/@blazediff/core-native.svg?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![PyPI](https://img.shields.io/pypi/v/blazediff.svg?style=for-the-badge)](https://pypi.org/project/blazediff/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

## Features

- **Block-based optimization** - Skip identical regions for massive speedups on similar images
- **SIMD acceleration** - Native SSE4.1 (x86) and NEON (ARM) implementations
- **Multiple formats** - PNG, JPEG, and QOI support
- **Perceptual diffing** - YIQ-based color difference with antialiasing detection
- **In-house PNG codec** - optional [`blazediff_png`](../blazediff-png), faster than spng on every fixture, with byte-exact decode parity; opt-in via `BLAZEDIFF_PNG_ENABLED`
- **Cross-platform** - Linux, macOS, and Windows support
- **Multi-language** - Native Rust crate, Node.js (N-API), and Python (PyO3) bindings - all sharing the same core

## Installation

### Rust (CLI + library)

```bash
cargo install blazediff
```

### Node.js - `@blazediff/core-native`

```bash
npm install @blazediff/core-native
```

N-API bindings shipped as pre-built `.node` binaries for macOS, Linux, and Windows (arm64 + x64). Built from this crate's `napi` Cargo feature.

```ts
import { compare } from "@blazediff/core-native";

const result = await compare("expected.png", "actual.png", "diff.png", {
  threshold: 0.1,
});
```

### Python - `blazediff`

```bash
pip install blazediff
```

PyO3 bindings shipped as `abi3-py38` wheels for CPython ≥ 3.8 (macOS, Linux manylinux, Windows; arm64 + x86_64). Built from this crate's `python` Cargo feature.

```python
from blazediff import compare

result = compare("expected.png", "actual.png", "diff.png", threshold=0.1)
if result.match:
    print("identical")
else:
    print(f"{result.diff_count} pixels differ ({result.diff_percentage:.2f}%)")
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

See [INTERPRET.md](./INTERPRET.md) for the full algorithm documentation - pipeline stages, formulas, classification rules, and output format.

## Performance

3-4x faster than odiff, 8x faster than pixelmatch on 4K images.

PNG I/O defaults to spng. Setting `BLAZEDIFF_PNG_ENABLED=1` routes decode and stored
(level 0) encode through the in-house [`blazediff_png`](../blazediff-png) codec,
which is faster than spng on every fixture.

## License

MIT
