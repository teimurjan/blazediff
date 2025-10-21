# Testing with MATLAB/Octave

This document describes how to run validation tests against MATLAB/Octave reference implementations for SSIM and GMSD.

## Prerequisites

### Install Octave

**macOS (Homebrew):**
```bash
brew install octave
```

**Linux (apt):**
```bash
sudo apt-get install octave
```

**Windows:**
Download from https://www.gnu.org/software/octave/

### Install Octave Image Package

The image package provides functions like `fspecial`, `imfilter`, `rgb2gray`, and `std2`:

```bash
octave --eval "pkg install -forge image"
```

## Running Tests

### SSIM Tests

```bash
cd packages/ssim
pnpm test
```

The tests compare TypeScript implementations against MATLAB reference scripts in `matlab/`:
- `ssim.m` - Single-scale SSIM with automatic downsampling
- `msssim.m` - Multi-scale SSIM

**Expected accuracy:**
- SSIM: 0.00-0.03% difference from MATLAB
- MS-SSIM: 0.00-0.05% difference from MATLAB

### GMSD Tests

```bash
cd packages/gmsd
pnpm test
```

The tests compare TypeScript implementation against MATLAB reference script:
- `matlab/GMSD.m` - Gradient Magnitude Similarity Deviation

**Expected accuracy:**
- GMSD: 0.00-0.67% difference from MATLAB

## Test Structure

### MATLAB Scripts Location

```
packages/ssim/matlab/
  ├── ssim.m              # SSIM implementation
  ├── msssim.m            # MS-SSIM implementation
  ├── fspecial.m          # Gaussian window generation
  ├── imfilter.m          # Image filtering
  ├── padarray.m          # Array padding
  └── mean2.m             # 2D mean calculation

packages/gmsd/matlab/
  └── GMSD.m              # GMSD implementation
```

### Test Images

Test fixtures are located in:
```
packages/benchmark/fixtures/blazediff/
  ├── 1a.png  1b.png      # Small differences
  ├── 2a.png  2b.png      # Medium differences
  └── 3a.png  3b.png      # Large differences
```

### Test Execution

Tests use Node.js `execSync` to call Octave:

```typescript
const matlabScript = [
  `pkg load image`,
  `addpath('${matlabPath}')`,
  `img1 = imread('${img1Path}')`,
  `img2 = imread('${img2Path}')`,
  `result = ssim(img1, img2)`,
  `fprintf('%.15f', result)`,
].join("; ");

const output = execSync(`octave --eval "${matlabScript}"`, {
  encoding: "utf-8"
});
```

## Troubleshooting

### Error: 'fspecial' undefined

The image package is not loaded. Install it:
```bash
octave --eval "pkg install -forge image"
```

### Timeout error

Increase the timeout in test files:
```typescript
it("test name", { timeout: 30000 }, async () => {
  // Test code
});
```

### Permission denied

Ensure Octave scripts are readable:
```bash
chmod +r packages/ssim/matlab/*.m
chmod +r packages/gmsd/matlab/*.m
```

## Manual Verification

### Run SSIM manually

```bash
octave --eval "
  pkg load image;
  addpath('packages/ssim/matlab');
  img1 = imread('packages/benchmark/fixtures/blazediff/1a.png');
  img2 = imread('packages/benchmark/fixtures/blazediff/1b.png');
  if size(img1, 3) == 3, img1 = rgb2gray(img1); end;
  if size(img2, 3) == 3, img2 = rgb2gray(img2); end;
  result = ssim(double(img1), double(img2));
  fprintf('SSIM: %.15f\\n', result);
"
```

### Run GMSD manually

```bash
octave --eval "
  pkg load image;
  addpath('packages/gmsd/matlab');
  img1 = imread('packages/benchmark/fixtures/blazediff/1a.png');
  img2 = imread('packages/benchmark/fixtures/blazediff/1b.png');
  if size(img1, 3) == 3, img1 = rgb2gray(img1); end;
  if size(img2, 3) == 3, img2 = rgb2gray(img2); end;
  [score, quality_map] = GMSD(double(img1), double(img2));
  fprintf('GMSD: %.15f\\n', score);
"
```

