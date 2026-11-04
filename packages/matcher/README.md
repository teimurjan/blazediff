# @blazediff/matcher

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fmatcher?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/matcher)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fmatcher?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/matcher)

</div>

Core matcher logic for visual regression testing. Provides snapshot comparison with multiple algorithms, framework-agnostic APIs, and snapshot state tracking.

## Features

- **Multiple comparison methods**: `core`, `core-native`, `ssim`, `msssim`, `hitchhikers-ssim`, `gmsd`
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
    <td><code>diff</code></td>
    <td>Omit&lt;DiffOptions, "output"&gt;</td>
    <td>-</td>
    <td><code>threshold</code>, <code>antialiasing</code> (default true), <code>metric</code>, <code>mask</code>, <code>window</code> and <code>render</code>. See <code>@blazediff/core</code>. Used by core, core-wasm and core-native.</td>
  </tr>
  <tr>
    <td><code>ssim</code></td>
    <td>Omit&lt;SsimOptions, "output"&gt;</td>
    <td>-</td>
    <td><code>windowSize</code>, <code>k1</code>, <code>k2</code>, <code>bitDepth</code>, <code>msSsim</code> and <code>hitchhikers</code>. See <code>@blazediff/ssim</code>. Used by ssim, msssim and hitchhikers-ssim.</td>
  </tr>
  <tr>
    <td><code>gmsd</code></td>
    <td>Omit&lt;GmsdOptions, "output"&gt;</td>
    <td>-</td>
    <td><code>downsample</code> and <code>c</code>. See <code>@blazediff/gmsd</code>. Used by gmsd.</td>
  </tr>
  <tr>
    <td><code>runInWorker</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Run image I/O and comparison in a worker thread for better performance</td>
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
  | Uint8Array // Encoded PNG bytes (a Buffer works)
  | {
      data: Uint8Array | Uint8ClampedArray | Buffer;
      width: number;
      height: number;
    };
```

## Comparison Methods

### `core-native`
Rust-native comparison via N-API bindings. **Fastest method** with native performance.
- **Input**: File paths, PNG buffers or raw RGBA images
- **Algorithm**: YIQ color space with block-based optimization
- **Best for**: Production testing, large images

### `core-wasm`
The `core-native` algorithm compiled to WebAssembly. Same results, no native binaries.
- **Input**: File paths or buffers

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
  { method: 'core-native' },
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
    diff: { threshold: 0.05 }, // Stricter per-pixel color threshold
  },
  { testPath: __filename, testName: 'test name' }
);
```

### Different Comparison Methods

```typescript
// Fastest - Rust native (paths, PNG buffers or raw images)
await getOrCreateSnapshot(imagePath, { method: 'core-native' }, context);

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
