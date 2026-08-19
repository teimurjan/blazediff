# @blazediff/core-native

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=for-the-badge)](https://crates.io/crates/blazediff)

</div>

The fastest single-threaded image diff in the world. Native Rust implementation with SIMD optimization, **4.4-4.9x faster** and **3x smaller** than [odiff](https://github.com/dmtrKovalenko/odiff).

**Features:**
- **PNG, JPEG & QOI support** - auto-detected by file extension or encoded bytes
- SIMD-accelerated (NEON on ARM, SSE4.1 on x86)
- Block-based two-pass optimization
- YIQ perceptual color difference
- Anti-aliasing detection
- Cross-platform pre-built binaries (~700KB-900KB, no compilation required)

**Vendored Libraries:**
- [libspng](https://libspng.org/) - Fast PNG decoding/encoding with SIMD (default)
- [libjpeg-turbo](https://libjpeg-turbo.org/) - High-performance JPEG codec with SIMD
- [qoi](https://github.com/aldanor/qoi-rust) - QOI (Quite OK Image) format for fast lossless compression

> **Experimental PNG codec:** the binaries also bundle an in-house Rust PNG codec
> ([`blazediff-png`](https://github.com/teimurjan/blazediff/tree/main/crates/blazediff-png)),
> faster than spng on every fixture with byte-exact decode parity. It's opt-in:
> set `BLAZEDIFF_PNG_ENABLED=1` to route PNG decode and stored-block (level 0) encode
> through it. spng stays the default.

> **Note:** This package was previously published as [`@blazediff/bin`](https://www.npmjs.com/package/@blazediff/bin), which is now deprecated. Please use `@blazediff/core-native` instead.

## Installation

```bash
npm install @blazediff/core-native
```

Also available as a Rust crate: [`cargo install blazediff`](https://crates.io/crates/blazediff)

Pre-built binaries are included via platform-specific packages:
- [`@blazediff/core-native-darwin-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-darwin-arm64) - macOS ARM64 (Apple Silicon)
- [`@blazediff/core-native-darwin-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-darwin-x64) - macOS x64 (Intel)
- [`@blazediff/core-native-linux-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-linux-arm64) - Linux ARM64
- [`@blazediff/core-native-linux-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-linux-x64) - Linux x64
- [`@blazediff/core-native-win32-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-win32-arm64) - Windows ARM64
- [`@blazediff/core-native-win32-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native/core-native-win32-x64) - Windows x64

## API

### compare(base, comparison, diffOutput, options?)

Compare two images from file paths or encoded `Uint8Array`/`Buffer` inputs and optionally generate a diff image. Both inputs must use the same input type. Format is auto-detected from the file extension or encoded bytes.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>base</code></td>
    <td>string | Uint8Array</td>
    <td>Base/expected image path or encoded bytes</td>
  </tr>
  <tr>
    <td><code>comparison</code></td>
    <td>string | Uint8Array</td>
    <td>Comparison/actual image path or encoded bytes</td>
  </tr>
  <tr>
    <td><code>diffOutput</code></td>
    <td>string</td>
    <td>Path where the diff image will be saved</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>BlazeDiffOptions</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

<strong>Returns:</strong> `Promise<BlazeDiffResult>`

#### Encoded Buffer Inputs

```typescript
import { readFile } from "node:fs/promises";
import { compare } from "@blazediff/core-native";

const [expected, actual] = await Promise.all([
  readFile("expected.png"),
  readFile("actual.png"),
]);

const result = await compare(expected, actual, "diff.png");
```

The native binding borrows the existing `Buffer` or `Uint8Array` backing memory for the synchronous call. The encoded bytes are not copied into Rust, so the same JavaScript buffers can be reused across comparisons. Decoding still allocates native RGBA pixel buffers.

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>metric</code></td>
    <td>"pixel" | "ssim" | "ms-ssim" | "hitchhikers-ssim"</td>
    <td>"pixel"</td>
    <td>Comparison metric. <code>pixel</code> reports which pixels changed; the rest report a pooled similarity <code>score</code> in 0-1</td>
  </tr>
  <tr>
    <td><code>minScore</code></td>
    <td>number</td>
    <td>1</td>
    <td>Score at or above which the ssim metrics call two images identical</td>
  </tr>
  <tr>
    <td><code>ssimWindowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Local window size for the ssim metrics</td>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0.0-1.0). Lower = more strict. Pixel metric only</td>
  </tr>
  <tr>
    <td><code>antialiasing</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Enable anti-aliasing detection to exclude AA pixels from diff count</td>
  </tr>
  <tr>
    <td><code>diffMask</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Output only differences with transparent background</td>
  </tr>
  <tr>
    <td><code>diffColorAlt</code></td>
    <td>[number, number, number]</td>
    <td>diff color</td>
    <td>Alternative RGB color for darkening differences</td>
  </tr>
</table>

### Result Types

```typescript
type BlazeDiffResult =
  | { match: true }
  | { match: false; reason: "layout-diff" }
  | { match: false; reason: "pixel-diff"; diffCount: number; diffPercentage: number }
  | { match: false; reason: "file-not-exists"; file: string };
```

## Usage

### Programmatic API

```typescript
import { compare } from '@blazediff/core-native';

const result = await compare('expected.png', 'actual.png', 'diff.png', {
  threshold: 0.1,
  antialiasing: true,
});

if (result.match) {
  console.log('Images are identical!');
} else if (result.reason === 'pixel-diff') {
  console.log(`${result.diffCount} pixels differ (${result.diffPercentage.toFixed(2)}%)`);
} else if (result.reason === 'layout-diff') {
  console.log('Images have different dimensions');
}
```

### Describing What Changed

This package answers *where* two images differ. For *what* changed — labelled
regions, change types, severity and a human-readable summary — use
[`@blazediff/interpret-native`](https://www.npmjs.com/package/@blazediff/interpret-native),
which classifies the same diff and can also locate regions with an SSIM map or
boxes you already have.

```typescript
import { interpret } from '@blazediff/interpret-native';

const result = await interpret('expected.png', 'actual.png', 'diff.png');
console.log(result.summary);
console.log(`Severity: ${result.severity}, ${result.diffPercentage.toFixed(2)}% changed`);
```

### CLI Usage

```bash
# Compare two PNG images
npx blazediff expected.png actual.png diff.png

# Compare two JPEG images
npx blazediff expected.jpg actual.jpg diff.jpg

# Compare two QOI images
npx blazediff expected.qoi actual.qoi diff.qoi

# Mixed formats (PNG input, QOI output - recommended for smallest diff files)
npx blazediff expected.png actual.png diff.qoi

# With options
npx blazediff expected.png actual.png diff.png --threshold 0.05 --antialiasing

# Score structural similarity instead of counting pixels, and pass at 0.99
npx blazediff expected.png actual.png ssim-map.png --metric ssim --min-score 0.99

# With higher PNG compression (smaller output file, slower)
npx blazediff expected.png actual.png diff.png -c 6

# With JPEG quality setting
npx blazediff expected.jpg actual.jpg diff.jpg -q 85

# Output as JSON
npx blazediff expected.png actual.png diff.png --output-format json
```

### CLI Options

```
Usage: blazediff [OPTIONS] <IMAGE1> <IMAGE2> [OUTPUT]

Arguments:
  <IMAGE1>  First image path (PNG, JPEG, or QOI)
  <IMAGE2>  Second image path (PNG, JPEG, or QOI)
  [OUTPUT]  Output diff image path (optional, format detected from extension)

Options:
      --metric <METRIC>        pixel, ssim, ms-ssim or hitchhikers-ssim [default: pixel]
      --min-score <SCORE>      Score at or above which the ssim metrics call images identical [default: 1.0]
      --ssim-window-size <N>   Local window size for the ssim metrics [default: 11]
  -t, --threshold <THRESHOLD>  Color difference threshold (0.0-1.0) [default: 0.1]
  -a, --antialiasing           Enable anti-aliasing detection
      --diff-mask              Output only differences (transparent background)
      --diff-color-alt <R,G,B> Alternative RGB color for darkening differences
  -c, --compression <LEVEL>    PNG compression level (0-9, 0=fastest, 9=smallest) [default: 0]
  -q, --quality <QUALITY>      JPEG quality (1-100) [default: 90]
      --output-format <FORMAT> Output format (json or text) [default: json]
  -h, --help                   Print help
  -V, --version                Print version
```

### Supported Formats

| Format | Extensions | Notes |
|--------|------------|-------|
| PNG | `.png` | Lossless, supports transparency |
| JPEG | `.jpg`, `.jpeg` | Lossy, smaller file sizes |
| QOI | `.qoi` | Fast lossless, ideal for diff outputs (12x smaller than uncompressed PNG) |

Input images can be mixed formats (e.g., compare PNG to JPEG). Output format is determined by the output file extension.

**QOI for diff outputs:** QOI excels at encoding diff images with large uniform areas, producing files 12x smaller than PNG (level 0) while being faster to encode.

### Exit Codes

- `0` - Images are identical
- `1` - Images differ (includes layout/size mismatch)
- `2` - Error (file not found, invalid format, etc.)

## Performance

Benchmarked on Apple M1 Max (25 runs, 5 warmup, image IO included) against `odiff` on 5600×3200 4K PNG images via `hyperfine`. Full numbers in the root [BENCHMARKS.md](https://github.com/teimurjan/blazediff/blob/main/BENCHMARKS.md).

| Tool | 4k/1 | 4k/2 | 4k/3 | vs blazediff |
|------|-----:|-----:|-----:|-------------|
| **blazediff** | ~275ms | ~342ms | ~347ms | - |
| **blazediff** (encoded buffer input) | ~203ms | ~256ms | ~270ms | - |
| odiff | ~1266ms | ~1538ms | ~1799ms | 4.5-5.2x slower |

Binary sizes (stripped, LTO optimized) - **~3x smaller than odiff**:

| Platform | blazediff | odiff |
|----------|-----------|-------|
| macOS ARM64 | 702 KB | 2.2 MB |
| macOS x64 | 773 KB | 2.6 MB |
| Linux ARM64 | 753 KB | 2.3 MB |
| Linux x64 | 869 KB | 2.9 MB |
| Windows ARM64 | 580 KB | 2.4 MB |
| Windows x64 | 915 KB | 3.0 MB |

## Algorithm

BlazeDiff uses a two-pass block-based approach with SIMD acceleration:

1. **Cold Pass**: Scans image in 8x8 blocks using 32-bit integer comparison to identify changed regions
2. **Hot Pass**: Only processes blocks marked as changed, applying YIQ perceptual color difference
3. **SIMD**: Uses NEON (ARM) or SSE4.1 (x86) for parallel pixel processing
4. **Anti-aliasing**: Implements Vysniauskas (2009) algorithm to detect AA artifacts

## References

- **YIQ Color Space**: [Kotsarenko & Ramos (2009)](https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad) - "Measuring perceived color difference using YIQ NTSC transmission color space"
- **Anti-Aliasing Detection**: [Vysniauskas (2009)](https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector) - "Anti-aliased Pixel and Intensity Slope Detector"
- **Inspiration**: [odiff](https://github.com/dmtrKovalenko/odiff) - Fast image comparison tool written in Zig
