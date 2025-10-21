# BlazeDiff Mathematical Foundation

This document describes the mathematical formulas used in `@blazediff/core` for pixel-by-pixel image comparison.

## YIQ Color Difference Metric

Uses the YIQ NTSC color space for perceptually accurate color comparison.

### RGB to YIQ Conversion

```
Y = 0.29889531 × R + 0.58662247 × G + 0.11448223 × B
I = 0.59597799 × R - 0.2741761 × G - 0.32180189 × B
Q = 0.21147017 × R - 0.52261711 × G + 0.31114694 × B
```

### Color Difference Formula

```
ΔY = Y₁ - Y₂
ΔI = I₁ - I₂
ΔQ = Q₁ - Q₂

δ = 0.5053 × ΔY² + 0.299 × ΔI² + 0.1957 × ΔQ²
```

The result is sign-encoded:
- `ΔY > 0` (lightens): return `-δ`
- `ΔY ≤ 0` (darkens): return `+δ`

### Alpha Blending

Semi-transparent pixels are blended with a procedural checkerboard background:

```
rb = 48 + 159 × (k mod 2)
gb = 48 + 159 × (⌊k / φ⌋ & 1)
bb = 48 + 159 × (⌊k / Φ⌋ & 1)

ΔR = (R₁ × α₁ - R₂ × α₂ - rb × Δα) / 255
ΔG = (G₁ × α₁ - G₂ × α₂ - gb × Δα) / 255
ΔB = (B₁ × α₁ - B₂ × α₂ - bb × Δα) / 255
```

Where `k` is pixel position, `φ = 1.618...` (golden ratio), `Φ = 2.618...` (golden ratio squared).

## Threshold Comparison

```
maxDelta = 35215 × threshold²
```

A pixel is different if `|δ| > maxDelta`, where `35215` is the maximum YIQ delta.

## Anti-Aliasing Detection

For each pixel, examine its 8 neighbors:

1. Count equal neighbors (ΔY = 0). If > 2, not anti-aliased.
2. Find darkest (min ΔY) and brightest (max ΔY) neighbors.
3. If no darker OR no brighter neighbors exist, not anti-aliased.
4. Check if darkest or brightest neighbor has 3+ equal siblings in BOTH images.

A pixel is anti-aliased if:
- Has both darker and brighter neighbors (≤ 2 equal)
- Darkest or brightest neighbor has 3+ equal siblings in both images

## References

- Kotsarenko, Y., & Ramos, F. (2009). "Measuring perceived color difference using YIQ NTSC transmission color space in mobile applications." *Programación Matemática y Software*, 1(2). https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
- Vysniauskas, V. (2009). "Anti-aliased Pixel and Intensity Slope Detector." https://www.researchgate.net/publication/234073157_Anti-aliased_Pixel_and_Intensity_Slope_Detector
