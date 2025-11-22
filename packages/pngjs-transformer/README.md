# @blazediff/pngjs-transformer

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fpngjs-transformer)](https://www.npmjs.com/package/@blazediff/pngjs-transformer)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fpngjs-transformer)](https://www.npmjs.com/package/@blazediff/pngjs-transformer)

</div>


PNG image transformer using [pngjs](https://www.npmjs.com/package/pngjs) for the BlazeDiff library.

## Installation

```bash
npm install @blazediff/pngjs-transformer
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
import { pngjsTransformer } from '@blazediff/pngjs-transformer';

const image = await pngjsTransformer.read('./image.png');

await pngjsTransformer.write(image, './output.png');
```

