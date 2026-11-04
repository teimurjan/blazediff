# @blazediff/cli

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fcli?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/cli)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcli?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/cli)

</div>

Command-line interface for the BlazeDiff image comparison library.

## Installation

```bash
npm install -g @blazediff/cli
```

## Usage

```bash
blazediff-cli <command> <image1> <image2> [options]
```

## Commands

BlazeDiff supports multiple comparison algorithms, each optimized for different use cases:

### `core-native` - Native binary comparison (default)
The fastest option. Uses the native Rust binary with SIMD optimization for maximum performance.

```bash
blazediff-cli image1.png image2.png -o diff.png [options]
# Or explicitly:
blazediff-cli core-native image1.png image2.png -o diff.png [options]
```

`core-native`, `core` and `core-wasm` take the same flags as the Rust `blazediff` CLI:

- `-o, --output <path>` - Output path for the diff image
- `-t, --threshold <num>` - Matching threshold (0 to 1, default: 0.1)
- `--no-antialiasing` - Count anti-aliased pixels as differences (detection is on by default)
- `--metric <name>` - Color metric: yiq (default) or oklab (pixelmatch 8)
- `--mask <path>` - Image whose non-black pixels are skipped
- `--window <n>` - Also report the n×n window with the most differences
- `-a, --alpha <num>` - Opacity of the original image in the diff (default: 0.1)
- `--diff-color <r,g,b>` - Color for different pixels (default: 255,0,0)
- `--diff-color-alt <r,g,b>` - Color for pixels that get darker (default: diff color)
- `--aa-color <r,g,b>` - Color for anti-aliased pixels (default: 255,255,0)
- `--background <faded|transparent>` - What the diff image shows under the diff (default: faded)
- `--json` - Print the result object as JSON

`core-native` also takes `--compression <0-9>` and `--quality <1-100>`. `core` and `core-wasm` also take `--codec <pngjs|sharp|jsquash-png>`.

Exit codes: 0 identical, 1 the images differ or their dimensions do not match, 2 error.

### `core` and `core-wasm` - JavaScript and WebAssembly pixel comparison
No native dependencies. `core-wasm` runs the same Rust algorithm as `core-native`.

```bash
blazediff-cli core image1.png image2.png [options]
blazediff-cli core-wasm image1.png image2.png [options]
```

### `gmsd` - Gradient Magnitude Similarity Deviation
Perceptual quality metric based on gradient similarity.

```bash
blazediff-cli gmsd image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for GMS similarity map
- `--downsample <0|1>` - Downsample factor (0=full-res, 1=2x, default: 0)
- `--gmsd-c <num>` - Stability constant (default: 170)
- `--codec <name>` - Specify codec to use (pngjs, sharp, jsquash-png)
- `-h, --help` - Show help message

### `ssim` - Structural Similarity Index
Industry-standard metric for measuring structural similarity.

```bash
blazediff-cli ssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for SSIM map visualization
- `--codec <name>` - Specify codec to use (pngjs, sharp, jsquash-png)
- `-h, --help` - Show help message

### `msssim` - Multi-Scale Structural Similarity Index
Enhanced SSIM that operates at multiple image scales.

```bash
blazediff-cli msssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for MS-SSIM map visualization
- `--codec <name>` - Specify codec to use (pngjs, sharp, jsquash-png)
- `-h, --help` - Show help message

### `hitchhikers-ssim` - Fast SSIM
Integral image-based SSIM implementation for faster computation.

```bash
blazediff-cli hitchhikers-ssim image1.png image2.png [options]
```

### `interpret` - What changed, not just where
Structured region analysis: each change gets a type, a shape, a position and the
statistics behind them. Every other command answers *where* pixels differ or
*how alike* two images are; this one describes the change.

```bash
blazediff-cli interpret image1.png image2.png [output] [options]
```

`output` is written by the `pixel` source only — the metric sources and
`--regions` have no diff visualization to write, and passing one is an error
rather than a silently ignored path.

**Options:**
- `--source <name>` - How to locate regions: `pixel` (default), `ssim`, `ms-ssim`, `hitchhikers-ssim`
- `-t, --threshold <num>` - Color difference threshold (0 to 1, default: 0.1). `pixel` only
- `-a, --antialiasing` - Exclude anti-aliased pixels. `pixel` only
- `-c, --compression <num>` - PNG compression level (0-9, default: 0)
- `--window-size <num>` - Local window size for the metric sources (default: 11)
- `--region-floor <num>` - Window score at or below which it counts as changed (default: 0.99)
- `--regions <json>` - Skip the search and classify these boxes instead
- `--json` - Print the full result as JSON
- `-h, --help` - Show help message

The metric sources locate regions by thresholding a similarity map, so their boxes
are as coarse as that map's grid. The numbers are not: every box is refined against
the source pixels first, so pixel counts stay per-pixel.

Exits 0 when nothing actionable changed, 1 when it did, 2 on error.

## Examples

```bash
# Native binary diff (default, fastest)
blazediff-cli image1.png image2.png diff.png
blazediff-cli core-native image1.png image2.png diff.png -t 0.05 -a

# JavaScript pixel diff (more options)
blazediff-cli core image1.png image2.png -o diff.png -t 0.05

# GMSD similarity metric
blazediff-cli gmsd image1.png image2.png
blazediff-cli gmsd image1.png image2.png -o gms-map.png

# Describe what changed
blazediff-cli interpret image1.png image2.png
blazediff-cli interpret image1.png image2.png --source ms-ssim
blazediff-cli interpret image1.png image2.png --json

# SSIM structural similarity
blazediff-cli ssim image1.png image2.png
blazediff-cli ssim image1.png image2.png -o ssim-map.png

# MS-SSIM multi-scale similarity
blazediff-cli msssim image1.png image2.png
blazediff-cli msssim image1.png image2.png -o msssim-map.png

# Use Sharp codec for better performance (core/gmsd/ssim)
blazediff-cli core image1.jpg image2.jpg --codec sharp
```

## Codecs (for `core`, `gmsd`, `ssim`, `msssim`)

- **pngjs** (default) - Pure JavaScript, works everywhere. Supports PNG only.
- **sharp** - Native bindings, significantly faster. Supports PNG and JPEG.
- **jsquash-png** - WASM-based, zero native deps. Faster than pngjs. PNG only.

## Exit Codes

### core-native/core Mode
- `0` - Images are identical
- `1` - Images have differences
- `2` - Error (file not found, invalid format, etc.)

### GMSD, SSIM, MS-SSIM Modes
- `0` - Images are highly similar (score >= 0.95)
- `1` - Images have noticeable differences (score < 0.95) or error occurred
