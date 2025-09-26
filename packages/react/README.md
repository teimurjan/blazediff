# @blazediff/react

React components for blazediff image comparison.

## Installation

```bash
npm install @blazediff/react
```

## Usage

```tsx
import { DifferenceMode, SwipeMode, TwoUpMode, OnionSkinMode } from '@blazediff/react';

// Difference Mode - Shows pixel differences
<DifferenceMode
  src1="image1.png"
  src2="image2.png"
  threshold={0.1}
  includeAA={false}
  alpha={0.1}
  onDiffComplete={(detail) => console.log('Diff:', detail)}
/>

// Swipe Mode - Interactive slider comparison
<SwipeMode
  src1="image1.png"
  src2="image2.png"
  alt1="Before"
  alt2="After"
  onPositionChange={(position) => console.log('Position:', position)}
/>

// Two-Up Mode - Side-by-side comparison
<TwoUpMode
  src1="image1.png"
  src2="image2.png"
  onImagesLoaded={(detail) => console.log('Loaded:', detail)}
/>

// Onion Skin Mode - Overlay with opacity control
<OnionSkinMode
  src1="image1.png"
  src2="image2.png"
  opacity={50}
  onOpacityChange={(opacity) => console.log('Opacity:', opacity)}
/>
```

## Components

### DifferenceMode

Highlights pixel differences between two images using the blazediff algorithm.

**Props:**
- `src1` (string): URL of the first image
- `src2` (string): URL of the second image
- `threshold` (number): Matching threshold (0-1, default: 0.1)
- `includeAA` (boolean): Include anti-aliasing in diff (default: false)
- `alpha` (number): Blending factor for unchanged pixels (0-1, default: 0.1)
- `onDiffComplete` (function): Callback when diff calculation completes
- `onDiffError` (function): Callback when an error occurs

### SwipeMode

Interactive slider to compare two images.

**Props:**
- `src1` (string): URL of the first image
- `src2` (string): URL of the second image
- `alt1` (string): Alt text for first image (default: "Before")
- `alt2` (string): Alt text for second image (default: "After")
- `onPositionChange` (function): Callback when slider position changes

### TwoUpMode

Side-by-side image comparison with dimension change detection.

**Props:**
- `src1` (string): URL of the first image
- `src2` (string): URL of the second image
- `onImagesLoaded` (function): Callback when images are loaded
- `onLoadError` (function): Callback when loading fails

### OnionSkinMode

Overlay images with adjustable opacity.

**Props:**
- `src1` (string): URL of the first image
- `src2` (string): URL of the second image
- `opacity` (number): Initial opacity (0-100, default: 50)
- `onOpacityChange` (function): Callback when opacity changes
- `onImagesLoaded` (function): Callback when images are loaded
- `onLoadError` (function): Callback when loading fails

## Styling

All components accept className props for styling:

```tsx
<DifferenceMode
  src1="image1.png"
  src2="image2.png"
  className="my-diff-component"
  containerClassName="my-container"
  canvasClassName="my-canvas"
/>
```

## License

MIT