# @blazediff/codec-sharp

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcodec-sharp?style=flat-square)](https://www.npmjs.com/package/@blazediff/codec-sharp)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcodec-sharp?style=flat-square)](https://www.npmjs.com/package/@blazediff/codec-sharp)

</div>

Image codec using Sharp for the BlazeDiff library.

> **Note:** This package was previously published as [`@blazediff/sharp-transformer`](https://www.npmjs.com/package/@blazediff/sharp-transformer), which is now deprecated. Please use `@blazediff/codec-sharp` instead.

## Installation

```bash
npm install @blazediff/codec-sharp
```

## API

### read(filePath)

Read an image file to BlazeDiff image format.

**Parameters:**
- `filePath` (string) - Path to the image file

**Returns:** Promise<{ data: Buffer | Uint8Array | Uint8ClampedArray; width: number; height: number; }>

### write(image, filePath)

Write a BlazeDiff image to a PNG file.

**Parameters:**
- `image` ({ data: Buffer | Uint8Array | Uint8ClampedArray; width: number; height: number; }) - Image data to write
- `filePath` (string) - Output file path

**Returns:** Promise<void>

## Usage

```typescript
import { codecSharp } from '@blazediff/codec-sharp';

const image = await codecSharp.read('./image.png');

await codecSharp.write(image, './output.png');
```

