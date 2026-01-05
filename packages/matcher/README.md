# @blazediff/matcher

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fmatcher)](https://www.npmjs.com/package/@blazediff/matcher)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fmatcher)](https://www.npmjs.com/package/@blazediff/matcher)

</div>

Core matcher logic for visual regression testing. Provides snapshot comparison with multiple algorithms, framework-agnostic APIs, and snapshot state tracking.

## Features

- **Multiple comparison methods**: `core`, `bin`, `ssim`, `msssim`, `hitchhikers-ssim`, `gmsd`
- **Flexible input types**: File paths or image buffers
- **Snapshot state tracking**: Reports added/matched/updated/failed status
- **Configurable thresholds**: Pixel count or percentage-based
- **Framework-agnostic**: Core logic for Jest, Vitest, Bun integrations
- **Rich comparison results**: Diff counts, percentages, and similarity scores

## Installation

```bash
npm install @blazediff/matcher
```

## Quick Start

```typescript
import { getOrCreateSnapshot } from '@blazediff/matcher';

const result = await getOrCreateSnapshot(
  imageBuffer, // or file path
  {
    method: 'core',
    failureThreshold: 0.01,
    failureThresholdType: 'percent',
  },
  {
    testPath: '/path/to/test.spec.ts',
    testName: 'should render correctly',
  }
);

console.log(result.pass); // true/false
console.log(result.snapshotStatus); // 'added' | 'matched' | 'updated' | 'failed'
console.log(result.diffPercentage); // e.g., 0.05
```

## API Reference

### getOrCreateSnapshot(received, options, testContext)

Main function for snapshot comparison.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>received</code></td>
    <td>ImageInput</td>
    <td>Image to compare (file path or buffer with dimensions)</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>MatcherOptions</td>
    <td>Comparison options (see below)</td>
  </tr>
  <tr>
    <td><code>testContext</code></td>
    <td>TestContext</td>
    <td>Test information (testPath, testName)</td>
  </tr>
</table>

**Returns:** `Promise<ComparisonResult>`

### MatcherOptions

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>method</code></td>
    <td>ComparisonMethod</td>
    <td>-</td>
    <td>Comparison algorithm to use</td>
  </tr>
  <tr>
    <td><code>failureThreshold</code></td>
    <td>number</td>
    <td>0</td>
    <td>Number of pixels or percentage difference allowed</td>
  </tr>
  <tr>
    <td><code>failureThresholdType</code></td>
    <td>'pixel' | 'percent'</td>
    <td>'pixel'</td>
    <td>How to interpret failureThreshold</td>
  </tr>
  <tr>
    <td><code>snapshotsDir</code></td>
    <td>string</td>
    <td>'__snapshots__'</td>
    <td>Directory to store snapshots (relative to test file)</td>
  </tr>
  <tr>
    <td><code>snapshotIdentifier</code></td>
    <td>string</td>
    <td>-</td>
    <td>Custom identifier for the snapshot file</td>
  </tr>
  <tr>
    <td><code>updateSnapshots</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Force update snapshots (like running with -u flag)</td>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold for core/bin methods (0-1)</td>
  </tr>
  <tr>
    <td><code>antialiasing</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Enable anti-aliasing detection (bin method)</td>
  </tr>
  <tr>
    <td><code>includeAA</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Include anti-aliased pixels in diff count (core method)</td>
  </tr>
  <tr>
    <td><code>windowSize</code></td>
    <td>number</td>
    <td>11</td>
    <td>Window size for SSIM variants</td>
  </tr>
  <tr>
    <td><code>k1</code></td>
    <td>number</td>
    <td>0.01</td>
    <td>k1 constant for SSIM</td>
  </tr>
  <tr>
    <td><code>k2</code></td>
    <td>number</td>
    <td>0.03</td>
    <td>k2 constant for SSIM</td>
  </tr>
  <tr>
    <td><code>downsample</code></td>
    <td>0 | 1</td>
    <td>0</td>
    <td>Downsample factor for GMSD</td>
  </tr>
</table>

### ComparisonResult

<table>
  <tr>
    <th width="500">Field</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>pass</code></td>
    <td>boolean</td>
    <td>Whether the comparison passed</td>
  </tr>
  <tr>
    <td><code>message</code></td>
    <td>string</td>
    <td>Human-readable message describing the result</td>
  </tr>
  <tr>
    <td><code>snapshotStatus</code></td>
    <td>SnapshotStatus</td>
    <td>'added' | 'matched' | 'updated' | 'failed'</td>
  </tr>
  <tr>
    <td><code>diffCount</code></td>
    <td>number</td>
    <td>Number of different pixels (pixel-based methods)</td>
  </tr>
  <tr>
    <td><code>diffPercentage</code></td>
    <td>number</td>
    <td>Percentage of different pixels</td>
  </tr>
  <tr>
    <td><code>score</code></td>
    <td>number</td>
    <td>Similarity score (SSIM: 1 = identical, GMSD: 0 = identical)</td>
  </tr>
  <tr>
    <td><code>baselinePath</code></td>
    <td>string</td>
    <td>Path to baseline snapshot</td>
  </tr>
  <tr>
    <td><code>receivedPath</code></td>
    <td>string</td>
    <td>Path to received image (saved for debugging on failure)</td>
  </tr>
  <tr>
    <td><code>diffPath</code></td>
    <td>string</td>
    <td>Path to diff visualization</td>
  </tr>
</table>

### ImageInput

```typescript
type ImageInput =
  | string // File path
  | {
      data: Uint8Array | Uint8ClampedArray | Buffer;
      width: number;
      height: number;
    };
```

## Comparison Methods

### `bin`
Rust-native comparison via N-API bindings. **Fastest method** with native performance.
- **Input**: File paths only
- **Algorithm**: YIQ color space with block-based optimization
- **Best for**: Production testing, large images

### `core`
Pixel-by-pixel comparison in JavaScript. Pure JS implementation with no native dependencies.
- **Input**: File paths or buffers
- **Algorithm**: YIQ color space with anti-aliasing detection
- **Best for**: Cross-platform compatibility

### `ssim`
Structural Similarity Index. Measures perceptual similarity.
- **Input**: File paths or buffers
- **Algorithm**: Standard SSIM with configurable window size
- **Best for**: Perceptual quality assessment
- **Score**: 1 = identical, lower = more different

### `msssim`
Multi-Scale Structural Similarity Index.
- **Input**: File paths or buffers
- **Algorithm**: SSIM across multiple scales
- **Best for**: Images with varying resolutions or scales

### `hitchhikers-ssim`
Fast SSIM approximation from Hitchhiker's Guide.
- **Input**: File paths or buffers
- **Algorithm**: Optimized SSIM calculation
- **Best for**: Faster SSIM with acceptable accuracy trade-off

### `gmsd`
Gradient Magnitude Similarity Deviation.
- **Input**: File paths or buffers
- **Algorithm**: Gradient-based perceptual similarity
- **Best for**: Detecting structural changes
- **Score**: 0 = identical, higher = more different

## Usage Examples

### With File Paths

```typescript
const result = await getOrCreateSnapshot(
  '/path/to/screenshot.png',
  { method: 'bin' },
  { testPath: __filename, testName: 'test name' }
);
```

### With Image Buffers

```typescript
const imageData = {
  data: new Uint8Array([...]),
  width: 800,
  height: 600,
};

const result = await getOrCreateSnapshot(
  imageData,
  { method: 'core' },
  { testPath: __filename, testName: 'test name' }
);
```

### Custom Threshold

```typescript
const result = await getOrCreateSnapshot(
  imagePath,
  {
    method: 'core',
    failureThreshold: 0.1,
    failureThresholdType: 'percent', // Allow 0.1% difference
  },
  { testPath: __filename, testName: 'test name' }
);
```

### Different Comparison Methods

```typescript
// Fastest - Rust native (file paths only)
await getOrCreateSnapshot(imagePath, { method: 'bin' }, context);

// Pure JavaScript
await getOrCreateSnapshot(imageBuffer, { method: 'core' }, context);

// Perceptual similarity
await getOrCreateSnapshot(imageBuffer, { method: 'ssim' }, context);

// Gradient-based
await getOrCreateSnapshot(imageBuffer, { method: 'gmsd' }, context);
```

## Framework Integrations

This package provides the core logic for framework-specific integrations:

- [@blazediff/jest](https://www.npmjs.com/package/@blazediff/jest) - Jest matcher
- [@blazediff/vitest](https://www.npmjs.com/package/@blazediff/vitest) - Vitest matcher
- [@blazediff/bun](https://www.npmjs.com/package/@blazediff/bun) - Bun test matcher

## Links

- [GitHub Repository](https://github.com/teimurjan/blazediff)
- [Documentation](https://blazediff.dev/docs/matcher)
- [NPM Package](https://www.npmjs.com/package/@blazediff/matcher)
