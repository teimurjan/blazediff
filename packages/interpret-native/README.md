# @blazediff/interpret-native

<div align="center">

[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Finterpret-native)](https://www.npmjs.com/package/@blazediff/interpret-native)
[![Crates.io](https://img.shields.io/crates/v/blazediff-interpret.svg)](https://crates.io/crates/blazediff-interpret)

</div>

Structured image diff analysis. Takes two images, runs a pixel diff, then classifies the result into regions with content-aware change types, spatial positions, and severity scoring.

Built on [`blazediff`](https://github.com/teimurjan/blazediff) — same Rust + SIMD engine, with a content analysis layer on top.

**What you get:**
- Region detection via connected-component labeling
- Content-aware classification (Addition, Deletion, Shift, ContentChange, ColorChange)
- Spatial position classification (top-left, center, bottom-right, etc.)
- Severity scoring (low / medium / high)
- Shape analysis (solid, contour frame, sparse, edge-dominated, mixed)
- Color delta and gradient stats per region
- Structured summary grouped by change type
- Compact mode for quick triage

## Installation

```bash
npm install @blazediff/interpret-native
```

Also available as a Rust crate: [`cargo install blazediff-interpret`](https://crates.io/crates/blazediff-interpret)

Pre-built binaries are included for all major platforms — no compilation required:
- macOS ARM64 (Apple Silicon) & x64 (Intel)
- Linux ARM64 & x64
- Windows ARM64 & x64

## API

### interpret(image1Path, image2Path, options?)

Runs a diff and returns structured analysis results.

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
    <td>InterpretOptions</td>
    <td>Options (optional)</td>
  </tr>
</table>

<strong>Returns:</strong> `Promise<InterpretResult | CompactResult>`

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
    <td>Enable anti-aliasing detection to exclude AA pixels</td>
  </tr>
  <tr>
    <td><code>compact</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Return compact results (summary + severity + compact regions only)</td>
  </tr>
</table>

### Result Types

```typescript
interface InterpretResult {
  summary: string;
  totalRegions: number;
  regions: ChangeRegion[];
  severity: string;      // "Low" | "Medium" | "High"
  diffPercentage: number;
  width: number;
  height: number;
}

interface CompactResult {
  summary: string;
  severity: string;
  diffPercentage: number;
  regions: CompactRegion[];
}

interface ChangeRegion {
  bbox: BoundingBox;
  pixelCount: number;
  percentage: number;
  position: string;       // "TopLeft" | "Center" | "BottomRight" | ...
  shape: string;          // "SolidRegion" | "ContourFrame" | ...
  shapeStats: ShapeStats;
  changeType: string;     // "Addition" | "Deletion" | "Shift" | "ContentChange" | "ColorChange"
  signals: ClassificationSignals;
  confidence: number;
  colorDelta: ColorDeltaStats;
  gradient: GradientStats;
}

interface CompactRegion {
  position: string;
  changeType: string;
  confidence: number;
  percentage: number;
}
```

### Change Types

| Change Type | When |
|---|---|
| `Addition` | Content appeared — changed pixels blend with background in image 1 but stand out in image 2 |
| `Deletion` | Content disappeared — changed pixels stand out in image 1 but blend with background in image 2 |
| `Shift` | Content moved — a matched Addition + Deletion pair with similar luminance and pixel count |
| `ContentChange` | Content modified — significant change where both images have distinct content |
| `ColorChange` | Colors shifted — structure preserved (low edge change) |

## Usage

```typescript
import { interpret } from '@blazediff/interpret-native';

const result = await interpret('expected.png', 'actual.png');
console.log(result.summary);
// "Moderate visual change detected (1.87% of image, 12 regions).
//  Content changed: 4 regions (bottom, center).
//  Content added: 3 regions (right, bottom, bottom-left).
//  ..."

for (const region of result.regions) {
  console.log(`${region.position}: ${region.changeType} (${region.percentage.toFixed(2)}%)`);
}

// Compact mode — just the essentials
const compact = await interpret('expected.png', 'actual.png', { compact: true });
console.log(compact.severity, compact.diffPercentage);
```

### CLI Usage

```bash
npx blazediff-interpret expected.png actual.png
npx blazediff-interpret expected.png actual.png --compact
npx blazediff-interpret expected.png actual.png --threshold 0.05 --antialiasing
```

### Exit Codes

- `0` - Images are identical
- `1` - Images differ (JSON on stdout)
- `2` - Error

## License

MIT
