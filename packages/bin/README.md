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
blazediff <image1> <image2> [options]
```

**Arguments:**
- `image1` - Path to the first image
- `image2` - Path to the second image

**Options:**
- `-o, --output <path>` - Output path for the diff image
- `-t, --threshold <num>` - Matching threshold (0 to 1, default: 0.1)
- `-a, --alpha <num>` - Opacity of original image in diff (default: 0.1)
- `--aa-color <r,g,b>` - Color for anti-aliased pixels (default: 255,255,0)
- `--diff-color <r,g,b>` - Color for different pixels (default: 255,0,0)
- `--diff-color-alt <r,g,b>` - Alternative color for dark differences
- `--include-aa` - Include anti-aliasing detection
- `--diff-mask` - Draw diff over transparent background
- `--transformer <name>` - Specify transformer to use (pngjs, sharp)
- `--color-space <name>` - Specify color space to use (yiq, ycbcr)
- `-h, --help` - Show help message

## Examples

```bash
# Basic comparison
blazediff image1.png image2.png

# Save diff image with custom threshold
blazediff image1.png image2.png -o diff.png -t 0.05

# Use Sharp transformer for better performance
blazediff image1.png image2.png --transformer sharp -o diff.png

# JPEG support (requires Sharp transformer)
blazediff image1.jpg image2.jpg --transformer sharp -o diff.png
```

## Transformers

- **pngjs** - Pure JavaScript, works everywhere. Supports PNG only.
- **sharp** - Native bindings, significantly faster. Supports PNG and JPEG.

## Exit Codes

- `0` - Images are identical
- `1` - Images have differences or error occurred
