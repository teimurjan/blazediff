# @blazediff/vitest

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fvitest)](https://www.npmjs.com/package/@blazediff/vitest)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fvitest)](https://www.npmjs.com/package/@blazediff/vitest)

</div>

Vitest matcher for visual regression testing with blazediff. Powered by @blazediff/matcher with Vitest-specific snapshot state integration.

## Features

- **Native Vitest matcher**: `toMatchImageSnapshot()` extends Vitest's expect
- **Snapshot state tracking**: Vitest reports accurate snapshot counts (added/matched/updated/failed)
- **Multiple comparison algorithms**: `core`, `bin`, `ssim`, `msssim`, `hitchhikers-ssim`, `gmsd`
- **Auto-setup**: Imports and registers automatically
- **Update mode**: Works with Vitest's `-u` flag
- **TypeScript support**: Full type definitions included

## Installation

```bash
npm install --save-dev @blazediff/vitest
```

**Peer dependencies**: Vitest >= 1.0.0

## Quick Start

```typescript
import { expect, it } from 'vitest';
import '@blazediff/vitest';

it('should match screenshot', async () => {
  const screenshot = await takeScreenshot();

  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
  });
});
```

## API Reference

### toMatchImageSnapshot(options?)

Vitest matcher for image snapshot comparison.

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
import { expect, it } from 'vitest';
import '@blazediff/vitest';

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
vitest -u

# Update snapshots for specific test
vitest -u path/to/test.spec.ts

# Or using environment variable
VITEST_UPDATE_SNAPSHOTS=true vitest
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
import { test, expect } from 'vitest';
import '@blazediff/vitest';
import { chromium } from 'playwright';

test('visual regression with Playwright', async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('https://example.com');

  const screenshot = await page.screenshot();
  await expect(screenshot).toMatchImageSnapshot({
    method: 'core',
  });

  await browser.close();
});
```

### Negation

```typescript
// Assert images are different
await expect(screenshot).not.toMatchImageSnapshot({
  method: 'core',
});
```

### Sequential Tests

For tests that might interfere with each other (e.g., cleaning up snapshots), use sequential execution:

```typescript
import { describe, it } from 'vitest';

describe.sequential('Visual regression tests', () => {
  it('test 1', async () => {
    await expect(image1).toMatchImageSnapshot({ method: 'core' });
  });

  it('test 2', async () => {
    await expect(image2).toMatchImageSnapshot({ method: 'core' });
  });
});
```

## Snapshot State Tracking

This matcher integrates with Vitest's snapshot state tracking system. Vitest will report accurate counts in test summaries:

```
Snapshots  2 written | 1 updated | 5 passed
```

The matcher updates Vitest's internal counters:
- **Written**: New snapshots created
- **Updated**: Snapshots updated with `-u` flag
- **Passed**: Existing snapshots matched
- **Failed**: Snapshot comparisons failed

## Setup

### Auto-setup (Recommended)

Simply import the package in your test file:

```typescript
import '@blazediff/vitest';
```

The matcher is automatically registered when imported.

### Manual Setup

Alternatively, call the setup function explicitly:

```typescript
import { setupBlazediffMatchers } from '@blazediff/vitest';

setupBlazediffMatchers();
```

### Global Setup

To avoid importing in every test file, add to your Vitest config:

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

```typescript
// vitest.setup.ts
import '@blazediff/vitest';
```

## TypeScript

TypeScript types are included. To use the matcher with TypeScript:

```typescript
import '@blazediff/vitest';

declare module 'vitest' {
  interface Assertion<T = any> {
    toMatchImageSnapshot(options?: Partial<import('@blazediff/matcher').MatcherOptions>): Promise<void>;
  }
}
```

The type augmentation is automatically included when you import the package.

## Links

- [GitHub Repository](https://github.com/teimurjan/blazediff)
- [Documentation](https://blazediff.dev/docs/vitest)
- [NPM Package](https://www.npmjs.com/package/@blazediff/vitest)
- [@blazediff/matcher](https://www.npmjs.com/package/@blazediff/matcher) - Core matcher logic
