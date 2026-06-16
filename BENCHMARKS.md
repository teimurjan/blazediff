# BlazeDiff Benchmarks

Performance benchmarks comparing BlazeDiff against popular alternatives across image diffing, structural similarity, and object diffing.

## Benchmark Targets

- **[Pixel By Pixel](./benchmarks/pixel-by-pixel.md)** - `@blazediff/core` (JS), `@blazediff/core-wasm`, `@blazediff/core-native`, and the `blazediff` PyPI bindings, compared against `pixelmatch`, `odiff`, and `opencv-python`.
- **[Structural Similarity](./benchmarks/structural.md)** - `@blazediff/ssim` (fast/original + hitchhikers) compared against `ssim.js` (fast + weber).
- **[Object Diffing](./benchmarks/object.md)** - `@blazediff/object` compared against `microdiff`.

Each target file embeds a summary chart of % improvement over the competitor (orange = BlazeDiff faster, magenta = regression).

## Test Fixtures

### Image Fixtures

The image benchmark fixtures used for testing are documented in the [fixtures README](./fixtures/README.md).

### Object Fixtures

The object benchmark fixtures can be viewed [here](./apps/object-benchmark/src/fixtures.ts).

## Hardware Specifications

All benchmarks are run on consistent hardware:

- **CPU**: Apple M1 Max
- **Runtime**: Node.js 22
- **OS**: macOS
