# @blazediff/bun

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fbun)](https://www.npmjs.com/package/@blazediff/bun)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fbun)](https://www.npmjs.com/package/@blazediff/bun)

</div>

Bun test matcher for visual regression testing with blazediff. Powered by @blazediff/matcher with Bun-specific snapshot state integration.

## Features

- **Native Bun matcher**: `toMatchImageSnapshot()` extends Bun's expect
- **Snapshot state tracking**: Bun reports accurate snapshot counts (when API available)
- **Multiple comparison algorithms**: `core`, `bin`, `ssim`, `msssim`, `hitchhikers-ssim`, `gmsd`
- **Auto-setup**: Imports and registers automatically
- **Update mode**: Works with Bun's `-u`/`--update` flag
- **TypeScript support**: Full type definitions included

## Installation

```bash
npm install --dev @blazediff/bun
```

**Peer dependencies**: Bun >= 1.0.0

## Quick Start

```typescript
import { expect, it } from 'bun:test';
import '@blazediff/bun';

it('should match screenshot', async () => {
  const screenshot = await takeScreenshot();

  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
  });
});
```

## API Reference

### toMatchImageSnapshot(options?)

Bun test matcher for image snapshot comparison.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>Partial&lt;MatcherOptions&gt;</td>
    <td>Optional comparison options (see below)</td>
  </tr>
</table>

#### Options

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>method</code></td>
    <td>'core' | 'bin' | 'ssim' | 'msssim' | 'hitchhikers-ssim' | 'gmsd'</td>
    <td>'core'</td>
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
    <td>Directory to store snapshots relative to test file</td>
  </tr>
  <tr>
    <td><code>snapshotIdentifier</code></td>
    <td>string</td>
    <td>'snapshot'</td>
    <td>Identifier for the snapshot file (required for Bun)</td>
  </tr>
  <tr>
    <td><code>updateSnapshots</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Force update snapshots</td>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0-1) for core/bin methods</td>
  </tr>
</table>

See [@blazediff/matcher](https://www.npmjs.com/package/@blazediff/matcher) for full options documentation.

## Usage Patterns

### Basic Snapshot Test

```typescript
import { expect, it } from 'bun:test';
import '@blazediff/bun';

it('renders correctly', async () => {
  const screenshot = await page.screenshot();

  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
    snapshotIdentifier: 'homepage',
  });
});
```

### Different Comparison Methods

```typescript
// Fast Rust-native comparison (file paths only)
await expect('/path/to/image.png').toMatchImageSnapshot({
  method: 'bin',
  snapshotIdentifier: 'image-bin',
});

// Pure JavaScript comparison
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'image-core',
});

// Perceptual similarity (SSIM)
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'ssim',
  snapshotIdentifier: 'image-ssim',
});

// Gradient-based comparison
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'gmsd',
  snapshotIdentifier: 'image-gmsd',
});
```

### Update Snapshots

```bash
# Update all snapshots (recommended)
bun test --update-snapshots

# Or using environment variable
BUN_UPDATE_SNAPSHOTS=true bun test
```

Or programmatically:

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage',
  updateSnapshots: true,
});
```

### Custom Thresholds

```typescript
// Allow up to 100 pixels difference
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage',
  failureThreshold: 100,
  failureThresholdType: 'pixel',
});

// Allow up to 0.1% difference
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage',
  failureThreshold: 0.1,
  failureThresholdType: 'percent',
});
```

### Custom Snapshot Directory

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage',
  snapshotsDir: '__image_snapshots__',
});
```

### With Playwright

```typescript
import { test, expect } from 'bun:test';
import '@blazediff/bun';
import { chromium } from 'playwright';

test('visual regression with Playwright', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://example.com');

  const screenshot = await page.screenshot();
  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
    snapshotIdentifier: 'homepage',
  });

  await browser.close();
});
```

### Negation

```typescript
// Assert images are different
await expect(screenshot).not.toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'different',
});
```

### Serial Tests

For tests that might interfere with each other (e.g., cleaning up snapshots), use serial execution:

```typescript
import { describe, it } from 'bun:test';

describe.serial('Visual regression tests', () => {
  it('test 1', async () => {
    await expect(image1).toMatchImageSnapshot({
      method: 'core',
      snapshotIdentifier: 'test-1',
    });
  });

  it('test 2', async () => {
    await expect(image2).toMatchImageSnapshot({
      method: 'core',
      snapshotIdentifier: 'test-2',
    });
  });
});
```

## Snapshot State Tracking

This matcher attempts to integrate with Bun's snapshot state tracking system. If Bun exposes the snapshot state API to custom matchers, test summaries will show accurate counts:

```
Snapshots  2 written | 1 updated | 5 passed
```

**Note**: Bun's snapshot state API for custom matchers is limited. If snapshot state is unavailable, image snapshots will still work correctly but may not appear in Bun's test summary counts.

## Bun-Specific Notes

### Snapshot Identifier Required

Unlike Jest and Vitest which can auto-generate snapshot identifiers from test names, Bun has limited context exposure. It's recommended to always provide a `snapshotIdentifier`:

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'my-component-state', // Recommended
});
```

### Test Path Detection

Bun provides `Bun.main` which is used to determine the test file path. In some edge cases, you may need to specify `snapshotsDir` as an absolute path:

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage',
  snapshotsDir: '/absolute/path/to/snapshots',
});
```

## Setup

### Auto-setup (Recommended)

Simply import the package in your test file:

```typescript
import '@blazediff/bun';
```

The matcher is automatically registered when imported.

### Manual Setup

Alternatively, call the setup function explicitly:

```typescript
import { setupBlazediffMatchers } from '@blazediff/bun';

setupBlazediffMatchers();
```

## TypeScript

TypeScript types are included. To use the matcher with TypeScript:

```typescript
import '@blazediff/bun';

declare module 'bun:test' {
  interface Matchers<T = unknown> {
    toMatchImageSnapshot(options?: Partial<import('@blazediff/matcher').MatcherOptions>): Promise<MatcherResult>;
  }
}
```

The type augmentation is automatically included when you import the package.

## Links

- [GitHub Repository](https://github.com/teimurjan/blazediff)
- [Documentation](https://blazediff.dev/docs/bun)
- [NPM Package](https://www.npmjs.com/package/@blazediff/bun)
- [@blazediff/matcher](https://www.npmjs.com/package/@blazediff/matcher) - Core matcher logic
