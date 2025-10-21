# GMSD Mathematical Foundation

This document describes the mathematical formulas used in `@blazediff/gmsd` for gradient-based image quality assessment.

## GMSD (Gradient Magnitude Similarity Deviation)

GMSD measures image quality by computing the standard deviation of gradient magnitude similarity between two images. **Lower values indicate better quality** (0 = identical, higher = more different).

### Algorithm Steps

1. **Downsample** (optional): Apply 2×2 averaging filter, then subsample by 2
2. **Compute gradients**: Apply Prewitt operator to both images
3. **Calculate similarity map**: Compute GMS for each pixel
4. **Return deviation**: Compute standard deviation of similarity map

### Downsampling (2× reduction)

```
aveKernel = [0.25  0.25]
            [0.25  0.25]

Y₁' = conv2(Y₁, aveKernel, 'same')
Y₂' = conv2(Y₂, aveKernel, 'same')

Y₁_ds = Y₁'(1:2:end, 1:2:end)
Y₂_ds = Y₂'(1:2:end, 1:2:end)
```

### Gradient Computation (Prewitt Operator)

```
dx = [1  0  -1]  / 3
     [1  0  -1]
     [1  0  -1]

dy = [1   1   1]  / 3
     [0   0   0]
     [-1 -1  -1]

Ix₁ = conv2(Y₁, dx, 'same')
Iy₁ = conv2(Y₁, dy, 'same')
gradientMap₁ = √(Ix₁² + Iy₁²)

Ix₂ = conv2(Y₂, dx, 'same')
Iy₂ = conv2(Y₂, dy, 'same')
gradientMap₂ = √(Ix₂² + Iy₂²)
```

### Gradient Magnitude Similarity (GMS)

```
GMS = (2 × gradientMap₁ × gradientMap₂ + C) / (gradientMap₁² + gradientMap₂² + C)
```

Where:
- `C = 170` (stability constant for 8-bit images, default 0-255 range)
- GMS ∈ [0, 1] where 1 = identical gradients

### GMSD Score

```
GMSD = std(GMS)
```

Standard deviation of the GMS map. Lower values = better quality.

**Typical ranges:**
- `0.00`: Perfect match (identical images)
- `0.00-0.05`: Excellent quality
- `0.05-0.15`: Good quality
- `0.15-0.35`: Noticeable differences
- `> 0.35`: Poor quality

## References

- Xue, W., Zhang, L., Mou, X., & Bovik, A. C. (2013). "Gradient Magnitude Similarity Deviation: A Highly Efficient Perceptual Image Quality Index." *IEEE Transactions on Image Processing*, 22(2), 684-695.
- Original MATLAB implementation: http://www4.comp.polyu.edu.hk/~cslzhang/IQA/GMSD/GMSD.htm

## Testing

See [@blazediff/ssim TESTING.md](../ssim/TESTING.md) for instructions on running MATLAB/Octave validation tests.
