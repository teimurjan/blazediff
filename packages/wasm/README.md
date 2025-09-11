# @blazediff/wasm

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fwasm)](https://www.npmjs.com/package/@blazediff/wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fwasm)](https://www.npmjs.com/package/@blazediff/wasm)

</div>

Blazing-fast SIMD-optimized WASM implementation of BlazeDiff image comparison algorithm.

## Installation

```bash
npm install @blazediff/wasm
```

## API

### blazediff(image1, image2, output, width, height, options)

WASM-accelerated image comparison with SIMD optimizations.

**Parameters:**
- `image1` - First image data (Uint8Array | Uint8ClampedArray)
- `image2` - Second image data (Uint8Array | Uint8ClampedArray)
- `output` - Optional output buffer for diff visualization
- `width` - Image width in pixels
- `height` - Image height in pixels
- `options` - Comparison options (optional)

**Returns:** Promise<number> - Number of different pixels

### initBlazeDiffWasm()

Initialize the WASM module manually.

**Returns:** Promise<void>

### isWasmInitialized()

Check if WASM module is initialized.

**Returns:** boolean

## Usage

```typescript
import blazediff from '@blazediff/wasm';

// Initialize WASM module (optional, auto-initializes on first use)
await blazediff.initBlazeDiffWasm();

// Compare images
const diffCount = await blazediff(
  image1.data,
  image2.data,
  outputData,
  width,
  height,
  {
    threshold: 0.1,
    alpha: 0.1,
    includeAA: false,
    diffMask: false
  }
);
```

