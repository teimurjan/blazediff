# @blazediff/wasm

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fwasm)](https://www.npmjs.com/package/@blazediff/wasm)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fwasm)](https://www.npmjs.com/package/@blazediff/wasm)

</div>

High-performance Rust implementation of blazediff compiled to WebAssembly with advanced SIMD optimizations. Provides the fastest pixel comparison performance through native Rust code and WebAssembly SIMD instructions.

## Installation

```bash
npm install @blazediff/wasm
```

## Important Build Configuration

When bundling this package, the `.wasm` file must be copied to your distribution directory. See the example below using tsup:

```typescript
// tsup.config.ts
import { copyFileSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "tsup";

export default defineConfig({
  // ... other config
  onSuccess: async () => {
    const wasmSrc = join(__dirname, "./node_modules/@blazediff/wasm/pkg/blazediff_wasm_bg.wasm");
    const wasmDest = join(__dirname, "dist/blazediff_wasm_bg.wasm");
    copyFileSync(wasmSrc, wasmDest);
  },
});
```

## API

### blazediff(image1, image2, output, width, height, options)

Compare two images and return the number of different pixels.

<table>
  <tr>
    <th width="500">Parameter</th>
    <th width="500">Type</th>
    <th width="500">Description</th>
  </tr>
  <tr>
    <td><code>image1</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>First image data</td>
  </tr>
  <tr>
    <td><code>image2</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>Second image data</td>
  </tr>
  <tr>
    <td><code>output</code></td>
    <td>Uint8Array | Uint8ClampedArray</td>
    <td>Optional output buffer for diff visualization</td>
  </tr>
  <tr>
    <td><code>width</code></td>
    <td>number</td>
    <td>Image width in pixels</td>
  </tr>
  <tr>
    <td><code>height</code></td>
    <td>number</td>
    <td>Image height in pixels</td>
  </tr>
  <tr>
    <td><code>options</code></td>
    <td>object</td>
    <td>Comparison options (optional)</td>
  </tr>
</table>

**Returns:** Number of different pixels

<table>
  <tr>
    <th width="500">Option</th>
    <th width="500">Type</th>
    <th width="500">Default</th>
    <th width="500">Description</th>
    <th width="500">Hint</th>
  </tr>
  <tr>
    <td><code>threshold</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Color difference threshold (0-1)</td>
    <td>Lower values = more sensitive. 0.05 for strict comparison, 0.2+ for loose comparison</td>
  </tr>
  <tr>
    <td><code>alpha</code></td>
    <td>number</td>
    <td>0.1</td>
    <td>Background image opacity</td>
    <td>Controls how faded unchanged pixels appear in diff output</td>
  </tr>
  <tr>
    <td><code>aaColor</code></td>
    <td>[number, number, number]</td>
    <td>[255,255,0]</td>
    <td>Anti-aliasing pixel color</td>
    <td>Yellow by default. Set to red [255,0,0] to highlight anti-aliasing</td>
  </tr>
  <tr>
    <td><code>diffColor</code></td>
    <td>[number, number, number]</td>
    <td>[255,0,0]</td>
    <td>Different pixel color</td>
    <td>Red by default. Use contrasting colors for better visibility</td>
  </tr>
  <tr>
    <td><code>diffColorAlt</code></td>
    <td>[number, number, number]</td>
    <td>-</td>
    <td>Alternative color for dark differences</td>
    <td>Helps distinguish light vs dark pixel changes</td>
  </tr>
  <tr>
    <td><code>includeAA</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Include anti-aliasing in diff count</td>
    <td>Set true to count anti-aliasing pixels as actual differences</td>
  </tr>
  <tr>
    <td><code>diffMask</code></td>
    <td>boolean</td>
    <td>false</td>
    <td>Output only differences (transparent background)</td>
    <td>Useful for creating overlay masks or highlighting changes only</td>
  </tr>
</table>

## Usage

```typescript
import { BlazeDiff } from '@blazediff/wasm';

// Initialize the diff engine
const blazeDiff = new BlazeDiff();

const diffCount = blazeDiff.diff(
  image1.data,
  image2.data,
  outputData,
  true, // hasOutput
  width,
  height,
  0.1,     // threshold
  0.1,     // alpha
  255, 255, 0,    // aaColor (R, G, B)
  255, 0, 0,      // diffColor (R, G, B)
  255, 0, 255,    // diffColorAlt (R, G, B)
  false,   // includeAA
  false    // diffMask
);
```

## Performance Features

This Rust WebAssembly implementation includes several advanced optimizations:

### SIMD Optimizations
- **64-byte SIMD blocks**: Processes 4 SIMD registers (64 bytes) simultaneously for maximum throughput
- **Adaptive block processing**: Fast SIMD path for pure comparison, pixel-level path only when drawing output
- **Vector-optimized identical checks**: Uses WebAssembly SIMD instructions for blazing-fast identical image detection

### Memory Optimizations
- **Direct pointer access**: Bypasses bounds checking for critical hot paths
- **Pre-calculated pointers**: Eliminates repeated pointer arithmetic
- **Cache-aligned processing**: 64-byte chunks align with CPU cache lines for optimal memory access

### Algorithm Optimizations
- **Optimized block size calculation**: Dynamic block sizing based on image dimensions using logarithmic scaling
- **Inline critical functions**: Eliminates function call overhead in performance-critical code paths
- **Reduced allocations**: Reuses pre-allocated buffers to minimize garbage collection impact

### Comparison with Other Implementations

- **vs JavaScript**: 3-10x faster depending on image size and content
- **vs AssemblyScript WASM**: 2-5x faster due to Rust's superior optimization and direct memory access
- **vs Core TypeScript**: 2-8x faster while maintaining identical results

## Build from Source

```bash
# Install dependencies
pnpm install

# Install wasm-pack (if not already installed)
cargo install wasm-pack

# Build everything (WASM + TypeScript)
pnpm build

# Build only WASM
pnpm build:wasm

# Build only TypeScript wrapper
pnpm build:ts

# Clean build artifacts
pnpm clean
```

**Note**: The build process automatically:
- Enables SIMD support with `RUSTFLAGS="-C target-feature=+simd128"`
- Compiles Rust to WebAssembly using `wasm-pack`
- Builds TypeScript wrapper with `tsup`
- Works cross-platform (Windows, macOS, Linux)

## Technical Details

- **Language**: Rust with WebAssembly compilation target
- **SIMD Support**: WebAssembly SIMD 128-bit vectors
- **Memory Safety**: Rust's ownership system with explicit unsafe blocks for performance
- **Optimization Level**: Release builds with maximum optimization (`opt-level = 3`)
- **Size**: Minimal footprint with optimized WebAssembly output