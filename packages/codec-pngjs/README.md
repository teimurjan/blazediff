# @blazediff/codec-pngjs

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcodec-pngjs?style=flat-square)](https://www.npmjs.com/package/@blazediff/codec-pngjs)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcodec-pngjs?style=flat-square)](https://www.npmjs.com/package/@blazediff/codec-pngjs)

</div>


PNG image codec using [pngjs](https://www.npmjs.com/package/pngjs) for the BlazeDiff library.

> **Note:** This package was previously published as [`@blazediff/pngjs-transformer`](https://www.npmjs.com/package/@blazediff/pngjs-transformer), which is now deprecated. Please use `@blazediff/codec-pngjs` instead.

## Installation

```bash
npm install @blazediff/codec-pngjs
```

## API

### read(filePath)

Reads a PNG file to image format (Uint8Array).

**Parameters:**
- `filePath` (string) - Path to the PNG file

**Returns:** Promise<{ data: Buffer | Uint8Array | Uint8ClampedArray; width: number; height: number; }>

### write(image, filePath)

Write a BlazeDiff image to a PNG file.

**Parameters:**
- `image` ({ data: Buffer | Uint8Array | Uint8ClampedArray; width: number; height: number; }) - Image data to write
- `filePath` (string) - Output file path

**Returns:** Promise<void>

## Usage

```typescript
import { codecPngjs } from '@blazediff/codec-pngjs';

const image = await codecPngjs.read('./image.png');

await codecPngjs.write(image, './output.png');
```

