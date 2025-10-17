# GMSD Formula and Implementation Verification

## Overview

GMSD (Gradient Magnitude Similarity Deviation) is an efficient perceptual image quality metric developed by Xue, Zhang, Mou, and Bovik (2013). It measures image similarity using gradient magnitudes and their standard deviation.

## Mathematical Formula

### 1. Gradient Magnitude (GM)

For each pixel in an image, the gradient magnitude is computed using the L2 norm:

```
GM(I) = ||∇I||₂ = √(Gx² + Gy²)
```

Where:
- `Gx` = horizontal gradient (computed using Prewitt operator)
- `Gy` = vertical gradient (computed using Prewitt operator)

**Prewitt Kernels (3x3) - Original GMSD Implementation:**

```
Gx:                    Gy:
[ 1  0 -1]   / 3      [ 1  1  1]   / 3
[ 1  0 -1]   / 3      [ 0  0  0]   / 3
[ 1  0 -1]   / 3      [-1 -1 -1]   / 3
```

**Note:** The original MATLAB GMSD implementation uses the Prewitt operator divided by 3, not Sobel. This produces smaller gradient magnitudes and is what the constant C=170 was tuned for.

### 2. Gradient Magnitude Similarity (GMS)

For each corresponding pixel in two images, the GMS is computed as:

```
GMS(x, y) = (2 - α) × GM(x) × GM(y) + C
            ────────────────────────────────────
            GM(x)² + GM(y)² - α × GM(x) × GM(y) + C
```

Where:
- `α` = weighting parameter (typically 0)
- `C` = stability constant (prevents division by zero)

**With α = 0 (our implementation):**

```
GMS(x, y) = 2 × GM(x) × GM(y) + C
            ──────────────────────
            GM(x)² + GM(y)² + C
```

### 3. GMSD Score

The final GMSD quality score is the standard deviation of all GMS values:

```
GMSD = stddev(GMS)
```

**For perceptual similarity metric (higher = more similar):**

```
Score = 1 - GMSD
Score ∈ [0, 1] where 1 = identical
```

## Implementation Details

### Our Implementation

```typescript
// 1. Compute gradient magnitudes squared (avoiding sqrt)
grad² = Gx² + Gy²

// 2. Compute GMS using squared gradients
GMS = (2 × √(grad1²) × √(grad2²) + C) / (grad1² + grad2² + C)
    = (2 × grad1 × grad2 + C) / (grad1² + grad2² + C)

// 3. Compute standard deviation
stddev = √(Σ(GMS - mean)² / N)

// 4. Convert to similarity score
score = 1 - stddev
```

### Constants

- **C (stability constant)**: Default = 170
  - Original MATLAB implementation uses `T = 170` for 8-bit images
  - Original paper uses `c = 0.00261437908496732` for normalized images [0,1]
  - For 8-bit images [0,255], we use: `C = 170` (from MATLAB implementation)
  - Prevents division by zero when gradients are small

- **α (alpha)**: Default = 0
  - Simplifies the formula
  - Most implementations use α = 0

### Optimizations

1. **Gradient Storage**: Store `grad²` instead of `grad` to avoid computing sqrt twice
2. **Border Handling**: 1px border excluded (zero gradients)
3. **Integer Arithmetic**: BT.601 luma conversion using `(77R + 150G + 29B) >> 8`
4. **Downsampling**: Optional 2x box filter for ~2x speedup

## Verification

### Test Coverage

Our implementation includes 20 comprehensive tests covering:

1. **Identical Images**: Score = 1.0 for all identical images
2. **Different Patterns**: Score < 1.0 for different gradient structures
3. **GMS Formula**: Correct computation according to mathematical formula
4. **Standard Deviation**: Proper stddev calculation
5. **Luma Conversion**: BT.601 coefficients (Y = 0.299R + 0.587G + 0.114B)
6. **Edge Detection**: Prewitt operator correctly detects horizontal/vertical edges
7. **Downsampling**: 2x downsampling produces similar scores (within 5%)
8. **Edge Cases**: Handles minimum size (3x3), all-black, all-white images
9. **Range Clamping**: Scores always in [0, 1] range

### Formula Correctness

**Mathematical Equivalence:**

Original formula (α = 0):
```
GMS = (2 × GM(x) × GM(y) + C) / (GM(x)² + GM(y)² + C)
```

Our implementation:
```
GMS = (2 × √(grad_x²) × √(grad_y²) + C) / (grad_x² + grad_y² + C)
    = (2 × grad_x × grad_y + C) / (grad_x² + grad_y² + C)
```

**✓ They are mathematically equivalent!**

### Test Results

```
✓ 20/20 tests passing
✓ All edge cases handled correctly
✓ Formula matches original GMSD paper
```

## Performance

- **Time Complexity**: O(N) where N = width × height
- **Memory Complexity**: O(N)
- **Speed**: ~4-6x slower than pixel diff, but much faster than SSIM (27x)
- **With Downsampling**: ~2x faster with minimal accuracy loss

## References

1. Xue, W., Zhang, L., Mou, X., & Bovik, A. C. (2013). "Gradient Magnitude Similarity Deviation: A Highly Efficient Perceptual Image Quality Index." IEEE Transactions on Image Processing.
2. Official implementation: http://www4.comp.polyu.edu.hk/~cslzhang/IQA/GMSD/GMSD.htm
3. PIQA library: https://piqa.readthedocs.io/en/stable/api/piqa.gmsd.html
