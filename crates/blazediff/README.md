# blazediff

High-performance image diffing with block-based optimization and SIMD acceleration.

[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=for-the-badge)](https://crates.io/crates/blazediff)
[![npm](https://img.shields.io/npm/v/@blazediff/core-native.svg?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![PyPI](https://img.shields.io/pypi/v/blazediff.svg?style=for-the-badge)](https://pypi.org/project/blazediff/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

## Features

- **Block-based optimization** - Skip identical regions for massive speedups on similar images
- **SIMD acceleration** - Native SSE4.1 (x86) and NEON (ARM) implementations
- **Multiple formats** - PNG, JPEG, and QOI support, via [`blazediff-shared`](../blazediff-shared)
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
import { diff } from "@blazediff/core-native";

const result = await diff("expected.png", "actual.png", {
  output: "diff.png",
  threshold: 0.1,
});
if (result.kind === "compared" && !result.identical) {
  console.log(`${result.count} pixels differ`);
}
```

### Python - `blazediff`

```bash
pip install blazediff
```

PyO3 bindings shipped as `abi3-py38` wheels for CPython ≥ 3.8 (macOS, Linux manylinux, Windows; arm64 + x86_64). Built from this crate's `python` Cargo feature.

```python
from blazediff import diff

result = diff("expected.png", "actual.png", "diff.png", threshold=0.1)
if result.kind == "compared" and not result.identical:
    print(f"{result.count} pixels differ ({result.percentage:.2f}%)")
```

`diff(a, b, output=None, *, threshold=0.1, antialiasing=True, metric="yiq", mask=None, window=None, alpha=0.1, diff_color=None, diff_color_alt=None, aa_color=None, background="faded", compression=0, quality=90)` takes file paths or encoded bytes. The result has a `kind`:

| `kind` | Fields |
| --- | --- |
| `"compared"` | `count`, `percentage`, `identical`, and `window` (`x`, `y`, `count`) when `window` is set |
| `"dimension-mismatch"` | `a` and `b`, each with `width` and `height` |
| `"io-error"` | `path` (when known) and `message` |

Invalid options raise `ValueError`.

## CLI Usage

```bash
# Basic diff
blazediff image1.png image2.png -o diff.png

# With custom threshold (0.0 - 1.0)
blazediff image1.png image2.png -o diff.png -t 0.1

# pixelmatch 8 metric, a mask, and the busiest 16×16 window, as JSON
blazediff image1.png image2.png --metric oklab --mask mask.png --window 16 --json
```

| Flag | Meaning |
| --- | --- |
| `-o, --output <path>` | Write the diff image (only when the images differ) |
| `-t, --threshold <n>` | Color difference threshold (0-1). Default: 0.1 |
| `--antialiasing`, `--no-antialiasing` | Detect anti-aliased pixels and leave them out of the count. Default: on |
| `--metric <yiq\|oklab>` | Color metric. `oklab` is pixelmatch 8's. Default: `yiq` |
| `--mask <path>` | Image the size of the inputs; its non-black pixels are skipped |
| `--window <n>` | Also report the N×N window with the most diff pixels |
| `-a, --alpha <n>` | Opacity of the faded background. Default: 0.1 |
| `--diff-color`, `--diff-color-alt`, `--aa-color <r,g,b>` | Output colors |
| `--background <faded\|transparent>` | What the diff image shows under the diff. Default: `faded` |
| `-c, --compression <0-9>`, `-q, --quality <1-100>` | PNG and JPEG encoder settings |
| `--json` | Print the result object as JSON |

Exit codes: 0 identical, 1 the images differ or their dimensions do not match, 2 error. With `--json`, a result prints to stdout (`{"kind":"compared","count":..,"percentage":..,"identical":..}`, or `{"kind":"dimension-mismatch","a":{..},"b":{..}}`) and an error prints to stderr (`{"kind":"io-error","path":..,"message":..}`).

## Library Usage

```rust
use blazediff::{diff, load_png, save_png, DiffOptions, DiffResult, Image, Metric};

let a = load_png("image1.png")?;
let b = load_png("image2.png")?;
let mut output = Image::new(a.width, a.height);
let options = DiffOptions {
    threshold: 0.1,
    metric: Metric::Oklab,
    window: Some(16),
    ..Default::default()
};

match diff(&a, &b, Some(&mut output), &options)? {
    DiffResult::Compared { count, window, .. } => {
        println!("Different pixels: {count}, busiest window: {window:?}");
        save_png(&output, "diff.png")?;
    }
    DiffResult::DimensionMismatch { a, b } => println!("Sizes differ: {a:?} vs {b:?}"),
}
```

`DiffOptions` holds `threshold`, `antialiasing` (default `true`), `metric` (`Yiq` or `Oklab`), `mask` (one byte per pixel, non-zero is skipped), `window`, and `render` (`alpha`, `diff_color`, `diff_color_alt`, `aa_color`, `background`). `diff` returns `Err` only for buffers that do not match their size and masks of the wrong length.

## Structural similarity

This crate is a pixel diff: it answers *where* two images differ. For *how alike*
they look — SSIM, MS-SSIM, Hitchhiker's SSIM — use
[`blazediff-ssim`](../blazediff-ssim), which stands alone and shares nothing with
this crate but the `blazediff-shared` primitives. It is also what
[`@blazediff/ssim-native`](https://www.npmjs.com/package/@blazediff/ssim-native)
wraps.

## Interpret

Structured region analysis that produces human-readable change descriptions. It is not part of this crate: it lives in [`blazediff-interpret`](../blazediff-interpret), which consumes what `diff` returns, with its own `blazediff-interpret` CLI.

The classifier is independent of whatever found the regions. Anything that can say *where* something changed can drive it: `blazediff-ssim` by thresholding a score map, or a caller passing boxes directly. Coarse boxes are fine — each is refined against the source pixels before any statistic is computed, so the analysis stays per-pixel.

See [INTERPRET.md](./INTERPRET.md) for the full algorithm documentation - pipeline stages, formulas, classification rules, and output format.

## Performance

4.3-4.9x faster than odiff, 8x faster than pixelmatch on 4K images.

Image I/O lives in [`blazediff-shared`](../blazediff-shared), shared with the other crates;
`load_png`, `save_jpeg` and friends are re-exported here unchanged. PNG encode uses the
in-house [`blazediff_png`](../blazediff-png) codec. A diff image has few colors, so it is
written as a palette PNG: the decoded pixels are the same and the file is about 4x smaller.
PNG decode defaults to spng. Setting `BLAZEDIFF_PNG_ENABLED=1` routes decode through
`blazediff_png` too, which is faster than spng on every fixture.

## License

MIT
