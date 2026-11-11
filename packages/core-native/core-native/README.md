# @blazediff/core-native

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore-native?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/core-native)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=for-the-badge)](https://crates.io/crates/blazediff)

</div>

The fastest single-threaded image diff in the world. Native Rust implementation with SIMD optimization, **4.3-4.9x faster** and **3x smaller** than [odiff](https://github.com/dmtrKovalenko/odiff).

**Features:**
- **PNG, JPEG & QOI support** - auto-detected by file extension or encoded bytes
- SIMD-accelerated (NEON on ARM, AVX2 or SSE4.1 on x86)
- Block-band scan: the perceptual diff runs only on blocks with a pixel over the threshold
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

### diff(a, b, options?)

Compare two images and optionally draw the diff. `options` is `@blazediff/core`'s `DiffOptions`, with a wider `output`.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>a</code>, <code>b</code></td>
    <td>string | Uint8Array | Image</td>
    <td>A file path, encoded PNG, JPEG or QOI bytes (a <code>Buffer</code> works), or raw RGBA pixels <code>{ data, width, height }</code>. The two sides can use different kinds</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>NativeDiffOptions</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

<strong>Returns:</strong> `Promise<NativeDiffResult>`

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
    <td>Color difference threshold (0-1). Lower is stricter</td>
  </tr>
  <tr>
    <td><code>antialiasing</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Detect anti-aliased pixels and leave them out of the count</td>
  </tr>
  <tr>
    <td><code>metric</code></td>
    <td>"yiq" | "oklab"</td>
    <td>"yiq"</td>
    <td>Color difference metric. <code>oklab</code> gives the same counts as pixelmatch 8</td>
  </tr>
  <tr>
    <td><code>mask</code></td>
    <td>Uint8Array</td>
    <td>-</td>
    <td>One byte per pixel (width × height). Non-zero pixels are skipped. Needs the N-API binding</td>
  </tr>
  <tr>
    <td><code>window</code></td>
    <td>number</td>
    <td>-</td>
    <td>Also report the N×N window with the most diff pixels</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>string | Image | { path, compression?, quality? }</td>
    <td>-</td>
    <td>Where to draw the diff: a file (PNG compression 0-9, JPEG quality 1-100), or an <code>Image</code> filled in place. A file is not written when the images are identical. An <code>Image</code> is always filled</td>
  </tr>
  <tr>
    <td><code>render</code></td>
    <td>{ alpha?, diffColor?, diffColorAlt?, aaColor?, background? }</td>
    <td>-</td>
    <td>Output styling. <code>background: "transparent"</code> draws the diff alone</td>
  </tr>
</table>

### Result Types

```typescript
type NativeDiffResult =
  | {
      kind: "compared";
      count: number;
      percentage: number;
      identical: boolean;
      /** Top-left corner and count of the busiest window, when `window` is set. */
      window?: { x: number; y: number; count: number };
    }
  | { kind: "dimension-mismatch"; a: Size; b: Size }
  | { kind: "io-error"; path?: string; message: string };
```

Invalid options or buffers throw a `BlazeDiffError` (re-exported from `@blazediff/core`) with a `code`: `invalid-image`, `invalid-output`, `invalid-mask` or `invalid-option`.

#### Encoded Buffer Inputs

```typescript
import { readFile } from "node:fs/promises";
import { diff } from "@blazediff/core-native";

const [expected, actual] = await Promise.all([
  readFile("expected.png"),
  readFile("actual.png"),
]);

const result = await diff(expected, actual, { output: "diff.png" });
```

The native binding borrows the existing `Buffer` or `Uint8Array` backing memory for the synchronous call. The encoded bytes are not copied into Rust, so the same JavaScript buffers can be reused across comparisons. Decoding still allocates native RGBA pixel buffers.

#### CLI fallback

If the N-API binding cannot load, `diff` runs the bundled `blazediff` CLI. The fallback takes path inputs and a path output only, and no `mask`. Anything else throws.

## Usage

### Programmatic API

```typescript
import { diff } from '@blazediff/core-native';

const result = await diff('expected.png', 'actual.png', {
  output: 'diff.png',
  threshold: 0.1,
});

if (result.kind === 'compared') {
  if (result.identical) console.log('Images are identical!');
  else console.log(`${result.count} pixels differ (${result.percentage.toFixed(2)}%)`);
} else if (result.kind === 'dimension-mismatch') {
  console.log('Images have different dimensions');
} else {
  console.log(`Could not read ${result.path}: ${result.message}`);
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
npx blazediff expected.png actual.png -o diff.png

# Compare two JPEG images
npx blazediff expected.jpg actual.jpg -o diff.jpg

# Mixed formats (PNG input, QOI output - recommended for smallest diff files)
npx blazediff expected.png actual.png -o diff.qoi

# With options
npx blazediff expected.png actual.png -o diff.png --threshold 0.05 --no-antialiasing

# pixelmatch 8 metric, a mask, and the busiest 16×16 window
npx blazediff expected.png actual.png --metric oklab --mask mask.png --window 16

# With higher PNG compression (smaller output file, slower)
npx blazediff expected.png actual.png -o diff.png -c 6

# Output as JSON
npx blazediff expected.png actual.png --json
```

### CLI Options

```
Usage: blazediff [OPTIONS] <A> <B>

Arguments:
  <A>  First image path (PNG, JPEG, or QOI)
  <B>  Second image path (PNG, JPEG, or QOI)

Options:
  -o, --output <OUTPUT>                  Write the diff image (only when the images differ)
  -t, --threshold <THRESHOLD>            Color difference threshold (0.0-1.0) [default: 0.1]
      --antialiasing                     Detect anti-aliased pixels and leave them out of the count (default)
      --no-antialiasing                  Count anti-aliased pixels as differences
      --metric <METRIC>                  Color difference metric: yiq or oklab (pixelmatch 8) [default: yiq]
      --mask <MASK>                      Image the size of the inputs; its non-black pixels are skipped
      --window <WINDOW>                  Also report the N×N window with the most diff pixels
  -a, --alpha <ALPHA>                    Opacity of the faded background (0.0-1.0) [default: 0.1]
      --diff-color <R,G,B>               RGB color for differing pixels
      --diff-color-alt <R,G,B>           RGB color for pixels that get darker in the second image
      --aa-color <R,G,B>                 RGB color for anti-aliased pixels
      --background <BACKGROUND>          faded or transparent [default: faded]
  -c, --compression <COMPRESSION>        PNG compression level (0-9, 0=fastest, 9=smallest) [default: 0]
  -q, --quality <QUALITY>                JPEG quality (1-100) [default: 90]
      --json                             Print the result as JSON
  -h, --help                             Print help
  -V, --version                          Print version
```

With `--json`, the result object prints to stdout and an error such as `{"kind":"io-error","path":"...","message":"..."}` prints to stderr.

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
- `1` - Images differ, or their dimensions do not match
- `2` - Error (file not found, invalid format, etc.)

## Performance

Benchmarked on Apple M1 Max (25 runs, 5 warmup, image IO included) against `odiff` on 5600×3200 4K PNG images via `tinybench`. Full numbers in the root [BENCHMARKS.md](https://github.com/teimurjan/blazediff/blob/main/BENCHMARKS.md).

| Tool | 4k/1 | 4k/2 | 4k/3 | vs blazediff |
|------|-----:|-----:|-----:|-------------|
| **blazediff** | ~274ms | ~363ms | ~368ms | - |
| **blazediff** (`BLAZEDIFF_PNG_ENABLED=1`) | ~190ms | ~242ms | ~250ms | - |
| odiff | ~1239ms | ~1563ms | ~1803ms | 4.3-4.9x slower |

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

BlazeDiff walks the image one band at a time. A band is one row of blocks. The block size grows with the image area, from 8 to 128 pixels.

1. **Cold pass**: A SIMD scan reads the band in pixel-row order and flags each block that holds a pixel over the threshold. An integer bound from the YIQ metric rejects most sub-threshold pixels before any float work.
2. **Hot pass**: The YIQ perceptual color difference runs on the flagged blocks only, while the band is still in the CPU cache. The other blocks get the gray background in one vectorized write.
3. **SIMD**: NEON (ARM), AVX2 or SSE4.1 (x86) for parallel pixel processing.
4. **Anti-aliasing**: The Vysniauskas (2009) algorithm detects AA artifacts on the pixels over the threshold.
5. **Zero copy**: The N-API binding diffs raw RGBA input in place and draws into your output buffer.

## References

- **YIQ Color Space**: [Kotsarenko & Ramos (2009)](https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad) - "Measuring perceived color difference using YIQ NTSC transmission color space"
- **Anti-Aliasing Detection**: [Vysniauskas (2009)](https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector) - "Anti-aliased Pixel and Intensity Slope Detector"
- **Inspiration**: [odiff](https://github.com/dmtrKovalenko/odiff) - Fast image comparison tool written in Zig
