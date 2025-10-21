# @blazediff/bin

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fbin)](https://www.npmjs.com/package/@blazediff/bin)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fbin)](https://www.npmjs.com/package/@blazediff/bin)

</div>

Command-line interface for the BlazeDiff image comparison library.

## Installation

```bash
npm install -g @blazediff/bin
```

## Usage

```bash
blazediff <command> <image1> <image2> [options]
```

## Commands

BlazeDiff supports multiple comparison algorithms, each optimized for different use cases:

### `diff` - Pixel-by-pixel comparison (default)
Fast pixel-level comparison for detecting visual regressions.

```bash
blazediff diff image1.png image2.png [options]
# Or simply:
blazediff image1.png image2.png [options]
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
blazediff gmsd image1.png image2.png [options]
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
blazediff ssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for SSIM map visualization
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

### `msssim` - Multi-Scale Structural Similarity Index
Enhanced SSIM that operates at multiple image scales.

```bash
blazediff msssim image1.png image2.png [options]
```

**Options:**
- `-o, --output <path>` - Output path for MS-SSIM map visualization
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `-h, --help` - Show help message

## Examples

```bash
# Pixel-by-pixel diff (default)
blazediff image1.png image2.png
blazediff diff image1.png image2.png -o diff.png -t 0.05

# GMSD similarity metric
blazediff gmsd image1.png image2.png
blazediff gmsd image1.png image2.png -o gms-map.png

# SSIM structural similarity
blazediff ssim image1.png image2.png
blazediff ssim image1.png image2.png -o ssim-map.png

# MS-SSIM multi-scale similarity
blazediff msssim image1.png image2.png
blazediff msssim image1.png image2.png -o msssim-map.png

# Use Sharp transformer for better performance
blazediff ssim image1.jpg image2.jpg --transformer sharp
```

## Transformers

- **pngjs** - Pure JavaScript, works everywhere. Supports PNG only.
- **sharp** - Native bindings, significantly faster. Supports PNG and JPEG.

## Exit Codes

### Diff Mode
- `0` - Images are identical
- `1` - Images have differences or error occurred

### GMSD, SSIM, MS-SSIM Modes
- `0` - Images are highly similar (score >= 0.95)
- `1` - Images have noticeable differences (score < 0.95) or error occurred
