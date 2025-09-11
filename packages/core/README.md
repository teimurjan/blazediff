# @blazediff/core

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcore)](https://www.npmjs.com/package/@blazediff/core)

</div>

High-performance pixel-by-pixel image comparison with block-based optimization. 20% faster than pixelmatch with zero memory allocation.

## Installation

```bash
npm install @blazediff/core
```

## API

### blazediff(image1, image2, output, width, height, options)

Compare two images and return the number of different pixels.

**Parameters:**
- `image1` - First image data (Uint8Array | Uint8ClampedArray)
- `image2` - Second image data (Uint8Array | Uint8ClampedArray)
- `output` - Optional output buffer for diff visualization
- `width` - Image width in pixels
- `height` - Image height in pixels
- `options` - Comparison options (optional)

**Returns:** Number of different pixels

**Options:**
- `threshold` (number, default: 0.1) - Color difference threshold (0-1)
- `alpha` (number, default: 0.1) - Background image opacity
- `aaColor` ([number, number, number], default: [255,255,0]) - Anti-aliasing pixel color
- `diffColor` ([number, number, number], default: [255,0,0]) - Different pixel color
- `diffColorAlt` ([number, number, number]) - Alternative color for dark differences
- `includeAA` (boolean, default: false) - Include anti-aliasing in diff count
- `diffMask` (boolean, default: false) - Output only differences (transparent background)

## Usage

```typescript
import blazediff from '@blazediff/core';

const diffCount = blazediff(
  image1.data,
  image2.data,
  outputData,
  width,
  height,
  {
    threshold: 0.1,
    alpha: 0.1,
    aaColor: [255, 255, 0],
    diffColor: [255, 0, 0],
    includeAA: false,
    diffMask: false
  }
);
```
