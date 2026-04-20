# @blazediff/core-native

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcore-native?style=flat-square)](https://www.npmjs.com/package/@blazediff/core-native)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore-native?style=flat-square)](https://www.npmjs.com/package/@blazediff/core-native)
[![Crates.io](https://img.shields.io/crates/v/blazediff.svg?style=flat-square)](https://crates.io/crates/blazediff)

</div>

The fastest single-threaded image diff in the world. Native Rust implementation with SIMD optimization, **3-4x faster** and **3x smaller** than [odiff](https://github.com/dmtrKovalenko/odiff).

**Features:**
- **PNG, JPEG & QOI support** - auto-detected by file extension
- SIMD-accelerated (NEON on ARM, SSE4.1 on x86)
- Block-based two-pass optimization
- YIQ perceptual color difference
- Anti-aliasing detection
- Cross-platform pre-built binaries (~700KB-900KB, no compilation required)

**Vendored Libraries:**
- [libspng](https://libspng.org/) - Fast PNG decoding/encoding with SIMD
- [libjpeg-turbo](https://libjpeg-turbo.org/) - High-performance JPEG codec with SIMD
- [qoi](https://github.com/aldanor/qoi-rust) - QOI (Quite OK Image) format for fast lossless compression

> **Note:** This package was previously published as [`@blazediff/bin`](https://www.npmjs.com/package/@blazediff/bin), which is now deprecated. Please use `@blazediff/core-native` instead.

## Installation

```bash
npm install @blazediff/core-native
```

Also available as a Rust crate: [`cargo install blazediff`](https://crates.io/crates/blazediff)

Pre-built binaries are included via platform-specific packages:
- [`@blazediff/core-native-darwin-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-darwin-arm64) - macOS ARM64 (Apple Silicon)
- [`@blazediff/core-native-darwin-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-darwin-x64) - macOS x64 (Intel)
- [`@blazediff/core-native-linux-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-linux-arm64) - Linux ARM64
- [`@blazediff/core-native-linux-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-linux-x64) - Linux x64
- [`@blazediff/core-native-win32-arm64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-win32-arm64) - Windows ARM64
- [`@blazediff/core-native-win32-x64`](https://github.com/teimurjan/blazediff/tree/main/packages/core-native-win32-x64) - Windows x64

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
  <tr>
    <td><code>interpret</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Run structured interpretation after diff — adds <code>interpretation</code> to the result with detected change regions, classification, and a human-readable summary</td>
  </tr>
  <tr>
    <td><code>outputFormat</code></td>
    <td>"png" | "html"</td>
    <td>"png"</td>
    <td>Output format for diff. Use <code>"html"</code> to generate an interpret report (implies <code>interpret: true</code>)</td>
  </tr>
</table>

### interpret(image1Path, image2Path, options?)

Convenience wrapper that calls `compare` with `interpret: true` and returns the `InterpretResult` directly. No diff image output — purely analytical.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1Path</code></td>
    <td>string</td>
    <td>Path to the first image</td>
  </tr>
  <tr>
    <td><code>image2Path</code></td>
    <td>string</td>
    <td>Path to the second image</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>Pick&lt;BlazeDiffOptions, "threshold" | "antialiasing"&gt;</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

<strong>Returns:</strong> `Promise<InterpretResult>`

### Result Types

```typescript
type BlazeDiffResult =
  | { match: true; interpretation?: InterpretResult }
  | { match: false; reason: "layout-diff" }
  | { match: false; reason: "pixel-diff"; diffCount: number; diffPercentage: number; interpretation?: InterpretResult }
  | { match: false; reason: "file-not-exists"; file: string };

interface InterpretResult {
  summary: string;          // Human-readable summary of the diff
  diffCount: number;        // Total number of differing pixels
  totalRegions: number;     // Number of detected change regions
  regions: ChangeRegion[];  // Detailed per-region analysis
  severity: string;         // Overall severity level
  diffPercentage: number;   // Percentage of pixels that differ
  width: number;            // Image width
  height: number;           // Image height
}

interface ChangeRegion {
  bbox: BoundingBox;               // Bounding box of the region
  pixelCount: number;              // Number of changed pixels in this region
  percentage: number;              // Percentage of image this region covers
  position: string;                // Spatial position descriptor
  shape: string;                   // Shape classification
  shapeStats: ShapeStats;          // Shape statistical analysis
  changeType: string;              // Type of change detected
  signals: ClassificationSignals;  // Classification signal details
  confidence: number;              // Confidence level of classification
  colorDelta: ColorDeltaStats;     // Color difference statistics
  gradient: GradientStats;         // Gradient analysis statistics
}
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

### Compare with Interpretation

```typescript
import { compare } from '@blazediff/core-native';

const result = await compare('expected.png', 'actual.png', 'diff.png', {
  threshold: 0.1,
  interpret: true,
});

if (!result.match && result.reason === 'pixel-diff') {
  const { interpretation } = result;
  console.log(interpretation.summary);
  for (const region of interpretation.regions) {
    console.log(`${region.position}: ${region.changeType} (${region.percentage.toFixed(2)}%)`);
  }
}
```

### Interpret Only (no diff image)

```typescript
import { interpret } from '@blazediff/core-native';

const result = await interpret('expected.png', 'actual.png');
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
| QOI | `.qoi` | Fast lossless, ideal for diff outputs (12x smaller than uncompressed PNG) |

Input images can be mixed formats (e.g., compare PNG to JPEG). Output format is determined by the output file extension.

**QOI for diff outputs:** QOI excels at encoding diff images with large uniform areas, producing files 12x smaller than PNG (level 0) while being faster to encode.

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
