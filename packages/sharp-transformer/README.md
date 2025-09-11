# @blazediff/sharp-transformer

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fsharp-transformer)](https://www.npmjs.com/package/@blazediff/sharp-transformer)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fsharp-transformer)](https://www.npmjs.com/package/@blazediff/sharp-transformer)

</div>

Image transformer using Sharp for the BlazeDiff library.

## Installation

```bash
npm install @blazediff/sharp-transformer
```

## API

### transform(filePath)

Transform an image file to BlazeDiff image format.

**Parameters:**
- `filePath` (string) - Path to the image file

**Returns:** Promise<BlazeDiffImage>

### write(image, filePath)

Write a BlazeDiff image to a PNG file.

**Parameters:**
- `image` (BlazeDiffImage) - Image data to write
- `filePath` (string) - Output file path

**Returns:** Promise<void>

## Usage

```typescript
import sharpTransformer from '@blazediff/sharp-transformer';

// Transform image file
const image = await sharpTransformer.transform('./image.png');

// Write image to file
await sharpTransformer.write(image, './output.png');
```

