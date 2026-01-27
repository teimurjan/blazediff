# @blazediff/bin

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fbin)](https://www.npmjs.com/package/@blazediff/bin)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fbin)](https://www.npmjs.com/package/@blazediff/bin)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg)](https://crates.io/crates/blazediff)

</div>

The fastest single-threaded image diff in the world. Native Rust implementation with SIMD optimization, **3-4x faster** and **3x smaller** than [odiff](https://github.com/dmtrKovalenko/odiff).

**Features:**
- **PNG & JPEG support** - auto-detected by file extension
- SIMD-accelerated (NEON on ARM, SSE4.1 on x86)
- Block-based two-pass optimization
- YIQ perceptual color difference
- Anti-aliasing detection
- Cross-platform pre-built binaries (~700KB-900KB, no compilation required)

**Vendored Libraries:**
- [libspng](https://libspng.org/) - Fast PNG decoding/encoding with SIMD
- [libjpeg-turbo](https://libjpeg-turbo.org/) - High-performance JPEG codec with SIMD

## Installation

```bash
npm install @blazediff/bin
```

Also available as a Rust crate: [`cargo install blazediff`](https://crates.io/crates/blazediff)

Pre-built [binaries](https://github.com/teimurjan/blazediff/tree/main/packages/bin/binaries) are included for:
- macOS ARM64 (Apple Silicon)
- macOS x64 (Intel)
- Linux ARM64
- Linux x64
- Windows ARM64
- Windows x64

## API

### compare(basePath, comparePath, diffOutput, options?)

Compare two images (PNG or JPEG) and generate a diff image. Format is auto-detected from file extension.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>basePath</code></td>
    <td>string</td>
    <td>Path to the base/expected image</td>
  </tr>
  <tr>
    <td><code>comparePath</code></td>
    <td>string</td>
    <td>Path to the comparison/actual image</td>
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

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0.0-1.0). Lower = more strict</td>
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
import { compare } from '@blazediff/bin';

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

### CLI Usage

```bash
# Compare two PNG images
npx blazediff expected.png actual.png diff.png

# Compare two JPEG images
npx blazediff expected.jpg actual.jpg diff.jpg

# Mixed formats (PNG input, JPEG output)
npx blazediff expected.png actual.png diff.jpg

# With options
npx blazediff expected.png actual.png diff.png --threshold 0.05 --antialiasing

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
  <IMAGE1>  First image path (PNG or JPEG)
  <IMAGE2>  Second image path (PNG or JPEG)
  [OUTPUT]  Output diff image path (optional, format detected from extension)

Options:
  -t, --threshold <THRESHOLD>  Color difference threshold (0.0-1.0) [default: 0.1]
  -a, --antialiasing           Enable anti-aliasing detection
      --diff-mask              Output only differences (transparent background)
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

Input images can be mixed formats (e.g., compare PNG to JPEG). Output format is determined by the output file extension.

### Exit Codes

- `0` - Images are identical
- `1` - Images differ (includes layout/size mismatch)
- `2` - Error (file not found, invalid format, etc.)

## Performance

Benchmarked on Apple M1 Pro with 5600x3200 4K PNG images:

| Tool | Benchmark Time | vs blazediff |
|------|------|--------------|
| **blazediff** | ~327ms | - |
| odiff | ~1215ms | 3.4x slower |

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
