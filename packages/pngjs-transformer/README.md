# @blazediff/pngjs-transformer

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fpngjs-transformer)](https://www.npmjs.com/package/@blazediff/pngjs-transformer)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fpngjs-transformer)](https://www.npmjs.com/package/@blazediff/pngjs-transformer)

</div>


PNG image transformer using pngjs for the BlazeDiff library.

## Installation

```bash
npm install @blazediff/pngjs-transformer
```

## API

### transform(filePath)

Transform a PNG file to BlazeDiff image format.

**Parameters:**
- `filePath` (string) - Path to the PNG file

**Returns:** Promise<BlazeDiffImage>

### write(image, filePath)

Write a BlazeDiff image to a PNG file.

**Parameters:**
- `image` (BlazeDiffImage) - Image data to write
- `filePath` (string) - Output file path

**Returns:** Promise<void>

## Usage

```typescript
import pngjsTransformer from '@blazediff/pngjs-transformer';

// Transform PNG file
const image = await pngjsTransformer.transform('./image.png');

// Write image to file
await pngjsTransformer.write(image, './output.png');
```

