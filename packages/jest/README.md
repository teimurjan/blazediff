# @blazediff/jest

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fjest)](https://www.npmjs.com/package/@blazediff/jest)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fjest)](https://www.npmjs.com/package/@blazediff/jest)

</div>

Jest matcher for visual regression testing with blazediff. Powered by @blazediff/matcher with Jest-specific snapshot state integration.

## Features

- **Native Jest matcher**: `toMatchImageSnapshot()` extends Jest's expect
- **Snapshot state tracking**: Jest reports accurate snapshot counts (added/matched/updated/failed)
- **Multiple comparison algorithms**: `core`, `bin`, `ssim`, `msssim`, `hitchhikers-ssim`, `gmsd`
- **Auto-setup**: Imports and registers automatically
- **Update mode**: Works with Jest's `-u` flag
- **TypeScript support**: Full type definitions included

## Installation

```bash
npm install --save-dev @blazediff/jest
```

**Peer dependencies**: Jest >= 27.0.0

## Quick Start

```typescript
import '@blazediff/jest';

describe('Visual Regression Tests', () => {
  it('should match screenshot', async () => {
    const screenshot = await takeScreenshot();

    await expect(screenshot).toMatchImageSnapshot({
      method: 'core',
    });
  });
});
```

## API Reference

### toMatchImageSnapshot(options?)

Jest matcher for image snapshot comparison.

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
    <td>auto-generated</td>
    <td>Custom identifier for the snapshot file</td>
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
  <tr>
    <td><code>runInWorker</code></td>
    <td>boolean</td>
    <td>true</td>
    <td>Run comparison in worker thread for better performance</td>
  </tr>
</table>

See [@blazediff/matcher](https://www.npmjs.com/package/@blazediff/matcher) for full options documentation.

## Usage Patterns

### Basic Snapshot Test

```typescript
import '@blazediff/jest';

it('renders correctly', async () => {
  const screenshot = await page.screenshot();

  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
  });
});
```

### Different Comparison Methods

```typescript
// Fast Rust-native comparison (file paths only)
await expect('/path/to/image.png').toMatchImageSnapshot({
  method: 'bin',
});

// Pure JavaScript comparison
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'core',
});

// Perceptual similarity (SSIM)
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'ssim',
});

// Gradient-based comparison
await expect(imageBuffer).toMatchImageSnapshot({
  method: 'gmsd',
});
```

### Update Snapshots

```bash
# Update all snapshots
jest -u

# Update snapshots for specific test
jest -u path/to/test.spec.ts

# Or using environment variable
JEST_UPDATE_SNAPSHOTS=true jest
```

Or programmatically:

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  updateSnapshots: true,
});
```

### Custom Thresholds

```typescript
// Allow up to 100 pixels difference
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  failureThreshold: 100,
  failureThresholdType: 'pixel',
});

// Allow up to 0.1% difference
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  failureThreshold: 0.1,
  failureThresholdType: 'percent',
});
```

### Custom Snapshot Directory

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotsDir: '__image_snapshots__',
});
```

### Custom Snapshot Identifier

```typescript
await expect(screenshot).toMatchImageSnapshot({
  method: 'core',
  snapshotIdentifier: 'homepage-desktop-chrome',
});
```

### With Playwright

```typescript
import { test, expect as playwrightExpect } from '@playwright/test';
import { expect as jestExpect } from '@jest/globals';
import '@blazediff/jest';

test('visual regression with Playwright', async ({ page }) => {
  await page.goto('https://example.com');
  const screenshot = await page.screenshot();

  await jestExpect(screenshot).toMatchImageSnapshot({
    method: 'core',
  });
});
```

### Negation

```typescript
// Assert images are different
await expect(screenshot).not.toMatchImageSnapshot({
  method: 'core',
});
```

## Snapshot State Tracking

This matcher integrates with Jest's snapshot state tracking system. Jest will report accurate counts in test summaries:

```
Snapshots:   2 added, 1 updated, 5 passed, 8 total
```

The matcher updates Jest's internal counters:
- **Added**: New snapshots created
- **Updated**: Snapshots updated with `-u` flag
- **Passed**: Existing snapshots matched
- **Failed**: Snapshot comparisons failed

## TypeScript

TypeScript types are included. To use the matcher with TypeScript:

```typescript
import '@blazediff/jest';

declare global {
  namespace jest {
    interface Matchers<R> {
      toMatchImageSnapshot(options?: Partial<import('@blazediff/matcher').MatcherOptions>): Promise<R>;
    }
  }
}
```

The type augmentation is automatically included when you import the package.

## Links

- [GitHub Repository](https://github.com/teimurjan/blazediff)
- [Documentation](https://blazediff.dev/docs/jest)
- [NPM Package](https://www.npmjs.com/package/@blazediff/jest)
- [@blazediff/matcher](https://www.npmjs.com/package/@blazediff/matcher) - Core matcher logic
