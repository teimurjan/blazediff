# Benchmark Fixtures

This directory contains test image fixtures used for benchmarking the blazediff library. Each subdirectory represents a different test scenario with various image pairs.

## Subdirectories

### `4k/`
Contains high-resolution 4K test images for performance benchmarking. These fixtures test the library's performance with large image files.

### `page/`
Contains page-level screenshot comparisons, typically representing full webpage captures for UI testing scenarios.

### `pixelmatch/`
Contains test fixtures specifically designed for pixel-level comparison testing, often used to validate accuracy against reference implementations.

### `same/`
Contains identical image pairs used to test the library's behavior when comparing images with no differences.

## File Naming Convention

Files are typically named with patterns like:
- `1a.png`, `1b.png` - First test case, images A and B
- `2a.png`, `2b.png` - Second test case, images A and B
- etc.

Each pair represents a before/after or expected/actual comparison scenario for testing the diff algorithm.

## Identical Image Testing

For performance benchmarking with identical images, we use the following approach:
- **Most folders**: Compare `1a.png` with itself (`1a` vs `1a`) to test identical image performance
- **`same/` folder**: Contains visually identical images with different metadata (e.g., `1a.png` vs `1b.png`), simulating real-world scenarios where identical screenshots are taken at different times

This testing strategy proves that BlazeDiff maintains super-fast performance with identical images, even when they have different file metadata or timestamps.