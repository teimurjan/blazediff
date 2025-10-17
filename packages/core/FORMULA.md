# BlazeDiff Algorithm and Mathematical Foundation

This document explains the mathematical foundation and algorithms used in `@blazediff/core` for pixel-by-pixel image comparison.

## Overview

BlazeDiff is a high-performance pixel-by-pixel image comparison algorithm that:
- Detects perceptually significant differences between images
- Filters out anti-aliasing artifacts
- Uses block-based optimization for better performance
- Implements YIQ color space for perceptual color difference

## Algorithm Components

### 1. Block-Based Optimization

Instead of comparing every pixel immediately, BlazeDiff first divides images into blocks and performs 32-bit integer comparisons for fast identical-block detection.

**Block Size Calculation:**

```
blockSize = 2^round(log₂(16 * √(√(area) / 100)))
```

Where `area = width × height`.

This formula:
- Adapts block size to image dimensions
- Uses power-of-2 sizes for cache alignment
- Balances granularity vs performance

**Block Comparison:**
- Uses 32-bit unsigned integer view of RGBA data
- Single comparison checks all 4 channels at once
- Early exit on first difference found
- Only changed blocks proceed to pixel-level analysis

### 2. YIQ Color Difference Metric

BlazeDiff uses the YIQ NTSC color space for perceptually accurate color comparison, as described in the paper ["Measuring perceived color difference using YIQ NTSC transmission color space in mobile applications"](https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad) by Y. Kotsarenko and F. Ramos (2009).

**RGB to YIQ Conversion:**

```
Y = 0.29889531 × R + 0.58662247 × G + 0.11448223 × B
I = 0.59597799 × R - 0.2741761 × G - 0.32180189 × B
Q = 0.21147017 × R - 0.52261711 × G + 0.31114694 × B
```

**Color Difference Formula:**

```
ΔY = Y₁ - Y₂
ΔI = I₁ - I₂
ΔQ = Q₁ - Q₂

δ = 0.5053 × ΔY² + 0.299 × ΔI² + 0.1957 × ΔQ²
```

The result is encoded with sign to indicate whether the pixel lightens or darkens:
- Positive delta (ΔY > 0): pixel lightens (return -δ)
- Negative delta (ΔY ≤ 0): pixel darkens (return +δ)

**Alpha Channel Handling:**

For semi-transparent pixels (alpha < 255), colors are blended with a procedurally-generated checkerboard background before comparison:

```
rb = 48 + 159 × (k mod 2)
gb = 48 + 159 × (⌊k / φ⌋ & 1)
bb = 48 + 159 × (⌊k / Φ⌋ & 1)
```

Where:
- `k` is the pixel position
- `φ` (phi) = 1.618033988749895 (golden ratio)
- `Φ` (Phi) = 2.618033988749895 (golden ratio squared)

The procedural checkerboard creates a perceptually consistent background while avoiding storage overhead.

Blended color differences:

```
ΔR = (R₁ × α₁ - R₂ × α₂ - rb × Δα) / 255
ΔG = (G₁ × α₁ - G₂ × α₂ - gb × Δα) / 255
ΔB = (B₁ × α₁ - B₂ × α₂ - bb × Δα) / 255
```

### 3. Threshold Comparison

**Maximum Delta Calculation:**

```
maxDelta = 35215 × threshold²
```

Where:
- `35215` is the maximum possible YIQ delta value
- `threshold` is a user-configurable value (0-1, default 0.1)

A pixel pair is considered different if:

```
|δ| > maxDelta
```

**Threshold Recommendations:**
- `0.05`: Strict comparison for precise pixel matching
- `0.1`: Default - balanced perceptual difference detection
- `0.2+`: Loose comparison for significant changes only

### 4. Anti-Aliasing Detection

BlazeDiff implements anti-aliasing detection based on the paper ["Anti-aliased Pixel and Intensity Slope Detector"](https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector) by V. Vysniauskas (2009).

**Detection Algorithm:**

For a pixel at position (x, y), examine its 8 adjacent neighbors:

1. **Count equal pixels**: If more than 2 neighbors have identical color (ΔY = 0), it's NOT anti-aliasing
2. **Find extremes**: Identify the darkest neighbor (min ΔY) and brightest neighbor (max ΔY)
3. **Check neighbors exist**: If no darker OR no brighter neighbors exist, it's NOT anti-aliasing
4. **Verify sibling patterns**: Check if the darkest or brightest neighbor has 3+ equal siblings in BOTH images

A pixel is considered anti-aliased if:
- It has both darker and brighter neighbors (≤ 2 equal neighbors)
- Either the darkest or brightest neighbor has 3+ equal siblings in both images

**Sibling Counting:**

A pixel has "many siblings" if 3 or more of its 8 neighbors share the same 32-bit RGBA value. Boundary pixels start with a count of 1.

### 5. Output Visualization

**Diff Mask Mode** (`diffMask = true`):
- Only different pixels are drawn
- Unchanged pixels remain transparent
- Useful for overlay masks

**Normal Mode** (`diffMask = false`):
- Unchanged pixels: Grayscale with configurable alpha blending
- Anti-aliased pixels: Colored with `aaColor` (yellow by default)
- Different pixels: Colored with `diffColor` (red) or `diffColorAlt` based on brightness change

**Grayscale Conversion:**

```
gray = 255 + ((Y - 255) × alpha × α) / 255
```

Where:
- `Y` is the luminance from YIQ conversion
- `alpha` is the user-configured background opacity (default 0.1)
- `α` is the pixel's alpha channel value

## Performance Optimizations

### 1. Fast Buffer Check
For identical buffers, `Buffer.compare()` provides instant detection (when available and enabled).

### 2. Block-Level Early Exit
Identical blocks skip pixel-level analysis entirely, saving ~20% time on partially-changed images.

### 3. 32-bit Integer Comparison
Using `Uint32Array` view allows single-operation RGBA comparison instead of 4 separate byte checks.

### 4. Zero Memory Allocation
All buffers are pre-allocated or reused; no dynamic allocation during comparison.

### 5. Cache-Friendly Access Patterns
Power-of-2 block sizes and sequential memory access maximize CPU cache utilization.

## Implementation Notes

### Data Format
- Input images must be in RGBA format (4 bytes per pixel)
- Data must be `Uint8Array`, `Uint8ClampedArray`, or Node.js `Buffer`
- Size must equal `width × height × 4` bytes

### Coordinate System
- Origin (0,0) is top-left corner
- X-axis increases rightward
- Y-axis increases downward
- Pixel at (x, y) is at index `(y × width + x) × 4`

## References

1. **YIQ Color Space**: Kotsarenko, Y., & Ramos, F. (2009). "Measuring perceived color difference using YIQ NTSC transmission color space in mobile applications." *Programación Matemática y Software*, 1(2). https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
2. **Anti-aliasing Detection**: Vysniauskas, V. (2009). "Anti-aliased Pixel and Intensity Slope Detector." https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector
3. **Pixelmatch**: Original inspiration for the algorithm structure. BlazeDiff improves upon it with block-based optimization and zero-allocation design. https://github.com/mapbox/pixelmatch

## See Also

- [@blazediff/gmsd](../gmsd/FORMULA.md) - Gradient-based perceptual metric for image quality assessment
- [Main Documentation](./README.md) - API reference and usage examples
