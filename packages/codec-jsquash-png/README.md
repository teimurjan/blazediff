# @blazediff/codec-jsquash-png

<div align="center">

[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcodec-jsquash-png)](https://www.npmjs.com/package/@blazediff/codec-jsquash-png)

</div>

WASM-based PNG image codec using [@jsquash/png](https://www.npmjs.com/package/@jsquash/png) for the BlazeDiff library. Zero native dependencies — uses WebAssembly for PNG encoding/decoding.

## Installation

```bash
npm install @blazediff/codec-jsquash-png
```

## API

### read(filePath)

Read a PNG file to BlazeDiff image format.

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
import { codecJsquashPng } from '@blazediff/codec-jsquash-png';

const image = await codecJsquashPng.read('./image.png');

await codecJsquashPng.write(image, './output.png');
```
