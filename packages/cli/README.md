# @blazediff/cli

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fcli)](https://www.npmjs.com/package/@blazediff/cli)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fcli)](https://www.npmjs.com/package/@blazediff/cli)

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

### `bin` - Native binary comparison (default)
The fastest option. Uses the native Rust binary with SIMD optimization for maximum performance.

```bash
blazediff-cli image1.png image2.png diff.png [options]
# Or explicitly:
blazediff-cli bin image1.png image2.png diff.png [options]
```

**Options:**
- `-t, --threshold <num>` - Color difference threshold (0 to 1, default: 0.1)
- `-a, --antialiasing` - Enable anti-aliasing detection
- `--diff-mask` - Output only differences (transparent background)
- `--fail-on-layout` - Fail immediately if images have different dimensions
- `-c, --compression <num>` - PNG compression level (0-9, default: 0)
- `-h, --help` - Show help message

### `core` - JavaScript pixel comparison
Pure JavaScript implementation. Slower than `bin` but offers more customization options.

```bash
blazediff-cli core image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for the diff image
- `-t, --threshold <num>` - Matching threshold (0 to 1, default: 0.1)
- `-a, --alpha <num>` - Opacity of original image in diff (default: 0.1)
- `--aa-color <r,g,b>` - Color for anti-aliased pixels (default: 255,255,0)
- `--diff-color <r,g,b>` - Color for different pixels (default: 255,0,0)
- `--diff-color-alt <r,g,b>` - Alternative color for dark differences
- `--include-aa` - Include anti-aliasing detection
- `--diff-mask` - Draw diff over transparent background
- `--color-space <name>` - Specify color space to use (yiq, ycbcr)
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

### `gmsd` - Gradient Magnitude Similarity Deviation
Perceptual quality metric based on gradient similarity.

```bash
blazediff-cli gmsd image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for GMS similarity map
- `--downsample <0|1>` - Downsample factor (0=full-res, 1=2x, default: 0)
- `--gmsd-c <num>` - Stability constant (default: 170)
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

### `ssim` - Structural Similarity Index
Industry-standard metric for measuring structural similarity.

```bash
blazediff-cli ssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for SSIM map visualization
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

### `msssim` - Multi-Scale Structural Similarity Index
Enhanced SSIM that operates at multiple image scales.

```bash
blazediff-cli msssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for MS-SSIM map visualization
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

### `hitchhikers-ssim` - Fast SSIM
Integral image-based SSIM implementation for faster computation.

```bash
blazediff-cli hitchhikers-ssim image1.png image2.png [options]
```

## Examples

```bash
# Native binary diff (default, fastest)
blazediff-cli image1.png image2.png diff.png
blazediff-cli bin image1.png image2.png diff.png -t 0.05 -a

# JavaScript pixel diff (more options)
blazediff-cli core image1.png image2.png -o diff.png -t 0.05

# GMSD similarity metric
blazediff-cli gmsd image1.png image2.png
blazediff-cli gmsd image1.png image2.png -o gms-map.png

# SSIM structural similarity
blazediff-cli ssim image1.png image2.png
blazediff-cli ssim image1.png image2.png -o ssim-map.png

# MS-SSIM multi-scale similarity
blazediff-cli msssim image1.png image2.png
blazediff-cli msssim image1.png image2.png -o msssim-map.png

# Use Sharp transformer for better performance (core/gmsd/ssim)
blazediff-cli core image1.jpg image2.jpg --transformer sharp
```

## Transformers (for `core`, `gmsd`, `ssim`, `msssim`)

- **pngjs** - Pure JavaScript, works everywhere. Supports PNG only.
- **sharp** - Native bindings, significantly faster. Supports PNG and JPEG.

## Exit Codes

### bin/core Mode
- `0` - Images are identical
- `1` - Images have differences
- `2` - Error (file not found, invalid format, etc.)

### GMSD, SSIM, MS-SSIM Modes
- `0` - Images are highly similar (score >= 0.95)
- `1` - Images have noticeable differences (score < 0.95) or error occurred
