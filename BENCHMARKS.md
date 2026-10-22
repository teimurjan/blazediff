# BlazeDiff Benchmarks

Performance benchmarks comparing BlazeDiff against popular alternatives across image diffing, structural similarity, and object diffing.

## Benchmark Targets

- **[Pixel By Pixel](./benchmarks/pixel-by-pixel.md)** - `@blazediff/core` (JS), `@blazediff/core-wasm`, `@blazediff/core-native`, and the `blazediff` PyPI bindings, compared against `pixelmatch`, `odiff`, `honeydiff`, and `opencv-python`.
- **[Structural Similarity](./benchmarks/structural.md)** - `@blazediff/ssim` (fast/original + hitchhikers) and `@blazediff/ssim-native` compared against `ssim.js` (fast + weber). The Rust SSIM family is also timed against `dssim` (website only).
- **[Object Diffing](./benchmarks/object.md)** - `@blazediff/object` compared against `microdiff`.
- **[PNG Codec](./benchmarks/png-codec.md)** - `blazediff-png` compared against `spng`, image-rs `png`, and `zune-png`.

The raw results, with machine, toolchain and commit, are committed as JSON in [`benchmarks/results/`](./benchmarks/results). The [website benchmarks page](https://blazediff.dev/benchmarks) renders them as charts. To regenerate a result, see [`scripts/bench/README.md`](./scripts/bench/README.md).

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
