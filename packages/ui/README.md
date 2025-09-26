# @blazediff/ui

<div align="center">

[![npm bundle size](https://img.shields.io/bundlephobia/min/%40blazediff%2Fui)](https://www.npmjs.com/package/@blazediff/ui)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fui)](https://www.npmjs.com/package/@blazediff/ui)

</div>


Unstyled web components for displaying image differences with multiple comparison modes: swipe, difference, two-up, and onion skin.

## Installation

```bash
npm install @blazediff/ui
```

## Usage

### Swipe Mode

The swipe mode allows users to drag a divider to compare two images side by side.

```html
<script type="module">
  import '@blazediff/ui';
</script>

<blazediff-swipe
  src1="path/to/image1.png"
  src2="path/to/image2.png"
  alt1="Before"
  alt2="After"
  class-container="swipe-container"
  class-image1="image-before"
  class-image2="image-after"
  class-divider="divider"
></blazediff-swipe>
```

#### Attributes

- `src1`: URL of the first image (before)
- `src2`: URL of the second image (after)
- `alt1`: Alt text for the first image (default: "Before")
- `alt2`: Alt text for the second image (default: "After")
- `class-container`: CSS class for the container element
- `class-image1`: CSS class for the first image
- `class-image2`: CSS class for the second image
- `class-divider`: CSS class for the divider

#### Events

- `position-change`: Fired when the divider position changes
  - `detail.position`: The divider position as a percentage (0-100)

### Difference Mode

The difference mode uses the blazediff algorithm to highlight pixel differences between two images.

```html
<script type="module">
  import '@blazediff/ui';
</script>

<blazediff-difference
  src1="path/to/image1.png"
  src2="path/to/image2.png"
  threshold="0.1"
  include-aa="false"
  alpha="0.1"
  class-container="diff-container"
  class-canvas="diff-canvas"
></blazediff-difference>
```

#### Attributes

- `src1`: URL of the first image
- `src2`: URL of the second image
- `threshold`: Matching threshold (0-1, default: 0.1)
- `include-aa`: Include anti-aliasing in diff ("true"/"false", default: "false")
- `alpha`: Blending factor for unchanged pixels (0-1, default: 0.1)
- `class-container`: CSS class for the container element
- `class-canvas`: CSS class for the canvas element

#### Events

- `diff-complete`: Fired when the diff calculation is complete
  - `detail.diffCount`: Number of different pixels
  - `detail.totalPixels`: Total number of pixels
  - `detail.percentage`: Percentage of different pixels
- `diff-error`: Fired when an error occurs
  - `detail.error`: The error object

### Two-Up Mode

The two-up mode displays two images side by side for quick comparison, with automatic dimension change detection.

```html
<script type="module">
  import '@blazediff/ui';
</script>

<blazediff-twoup
  src1="path/to/image1.png"
  src2="path/to/image2.png"
  class-container="twoup-container"
  class-container-inner="twoup-inner"
  class-panel="twoup-panel"
  class-image="twoup-image"
  class-dimension-info="dimension-info"
></blazediff-twoup>
```

#### Attributes

- `src1`: URL of the first image
- `src2`: URL of the second image
- `class-container`: CSS class for the outer container
- `class-container-inner`: CSS class for the inner container holding the panels
- `class-panel`: CSS class for each image panel
- `class-image`: CSS class for the images
- `class-dimension-info`: CSS class for the dimension info display

#### Events

- `images-loaded`: Fired when both images are loaded
  - `detail.image1`: Object with width and height of first image
  - `detail.image2`: Object with width and height of second image
- `load-error`: Fired when an error occurs loading images
  - `detail.error`: The error object

### Onion Skin Mode

The onion skin mode overlays two images with adjustable opacity, perfect for detecting small pixel shifts.

```html
<script type="module">
  import '@blazediff/ui';
</script>

<blazediff-onionskin
  src1="path/to/image1.png"
  src2="path/to/image2.png"
  opacity="50"
  class-container="onionskin-container"
  class-image-container="onionskin-images"
  class-image="onionskin-image"
  class-slider-container="slider-container"
  class-slider="opacity-slider"
  class-slider-label="slider-label"
></blazediff-onionskin>
```

#### Attributes

- `src1`: URL of the first image (bottom layer)
- `src2`: URL of the second image (top layer)
- `opacity`: Initial opacity of the top image (0-100, default: 50)
- `class-container`: CSS class for the main container
- `class-image-container`: CSS class for the image container
- `class-image`: CSS class for the images
- `class-slider-container`: CSS class for the slider container
- `class-slider`: CSS class for the opacity slider
- `class-slider-label`: CSS class for the slider label

#### Events

- `opacity-change`: Fired when the opacity slider changes
  - `detail.opacity`: The opacity value (0-100)
- `images-loaded`: Fired when both images are loaded
  - `detail.image1`: Object with width and height of first image
  - `detail.image2`: Object with width and height of second image
- `load-error`: Fired when an error occurs loading images
  - `detail.error`: The error object

## Styling

All components are unstyled by default. You can apply your own styles using the `class-*` attributes:

```css
.swipe-container {
  width: 100%;
  height: 500px;
}

.divider {
  background-color: #3b82f6;
  width: 4px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
}

.diff-container {
  display: flex;
  justify-content: center;
}

.diff-canvas {
  max-width: 100%;
  height: auto;
}
```

## Example with Event Handling

```html
<blazediff-swipe
  id="swipe-viewer"
  src1="image1.png"
  src2="image2.png"
></blazediff-swipe>

<script>
  const viewer = document.getElementById('swipe-viewer');
  viewer.addEventListener('position-change', (e) => {
    console.log('Position:', e.detail.position);
  });
</script>
```

```html
<blazediff-difference
  id="diff-viewer"
  src1="image1.png"
  src2="image2.png"
></blazediff-difference>

<script>
  const viewer = document.getElementById('diff-viewer');
  viewer.addEventListener('diff-complete', (e) => {
    console.log('Diff pixels:', e.detail.diffCount);
    console.log('Diff percentage:', e.detail.percentage + '%');
  });
</script>
```
