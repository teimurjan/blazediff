# SSIM Mathematical Foundation

This document describes the mathematical formulas used in `@blazediff/ssim` for structural similarity image quality assessment.

## SSIM (Structural Similarity Index)

SSIM measures image quality by comparing luminance, contrast, and structure between two images. **Higher values indicate better quality** (1 = identical, 0 = completely different).

### Local Statistics

For each window (typically 11×11 Gaussian):

```
μₓ = mean(x)     // Mean of window x
μᵧ = mean(y)     // Mean of window y
σₓ² = var(x)     // Variance of window x
σᵧ² = var(y)     // Variance of window y
σₓᵧ = cov(x,y)   // Covariance between windows x and y
```

### SSIM Formula

```
SSIM(x,y) = l(x,y) × c(x,y) × s(x,y)
```

Where:

```
l(x,y) = (2μₓμᵧ + C₁) / (μₓ² + μᵧ² + C₁)           // Luminance
c(x,y) = (2σₓσᵧ + C₂) / (σₓ² + σᵧ² + C₂)           // Contrast
s(x,y) = (σₓᵧ + C₂/2) / (σₓσᵧ + C₂/2)              // Structure
```

Simplified form:

```
SSIM(x,y) = ((2μₓμᵧ + C₁)(2σₓᵧ + C₂)) / ((μₓ² + μᵧ² + C₁)(σₓ² + σᵧ² + C₂))
```

### Constants

```
C₁ = (K₁ × L)²
C₂ = (K₂ × L)²
```

Where:
- `K₁ = 0.01` (default)
- `K₂ = 0.03` (default)
- `L = 255` (dynamic range for 8-bit images)

### Gaussian Window

Default window is 11×11 Gaussian with σ = 1.5:

```
w = fspecial('gaussian', 11, 1.5)
```

### Mean SSIM

```
MSSIM = mean(SSIM_map)
```

Average SSIM across all windows.

## MS-SSIM (Multi-Scale SSIM)

MS-SSIM extends SSIM by evaluating quality at multiple scales through iterative downsampling.

### Algorithm

1. Compute contrast and structure at each scale
2. Compute luminance only at the coarsest scale
3. Combine using weighted geometric mean

### Multi-Scale Formula

```
MS-SSIM = [l₅(x,y)]^α₅ × ∏(i=1 to 5) [cᵢ(x,y) × sᵢ(x,y)]^βᵢ
```

Where:
- Scale 1: Original resolution
- Scale 2-5: Iteratively downsampled by 2×
- Default weights: `[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]`

### Downsampling

Between scales, apply 2× downsampling:

```
img_down = imresize(img, 0.5, 'bicubic')
```

**Typical ranges:**
- `1.00`: Perfect match (identical images)
- `0.95-1.00`: Excellent quality
- `0.85-0.95`: Good quality
- `0.70-0.85`: Fair quality
- `< 0.70`: Poor quality

## References

- Wang, Z., Bovik, A. C., Sheikh, H. R., & Simoncelli, E. P. (2004). "Image quality assessment: From error visibility to structural similarity." *IEEE Transactions on Image Processing*, 13(4), 600-612.
- Wang, Z., Simoncelli, E. P., & Bovik, A. C. (2003). "Multi-scale structural similarity for image quality assessment." *IEEE Asilomar Conference on Signals, Systems and Computers*.
- Reference implementation: https://www.cns.nyu.edu/~lcv/ssim/

## Testing

See [TESTING.md](TESTING.md) for instructions on running MATLAB/Octave validation tests.
