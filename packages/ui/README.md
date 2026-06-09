# @blazediff/ui

<div align="center">

[![npm bundle size](https://img.shields.io/npm/unpacked-size/%40blazediff%2Fui?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/ui)
[![NPM Downloads](https://img.shields.io/npm/dy/%40blazediff%2Fui?style=for-the-badge)](https://www.npmjs.com/package/@blazediff/ui)

</div>

Headless engine and a framework-agnostic renderer for building image-diff UIs, with four comparison modes: swipe, difference, two-up, and onion skin.

The package has two layers:

- **`@blazediff/ui`** — a tiny pure-JS renderer. `mount*` functions create the DOM, wire events, and update it for you. No web components, no framework.
- **`@blazediff/ui/engine`** — the headless engine. All state, calculations, and handlers live here with zero rendering, so you can drive any framework (React, Vue, Svelte, …) from it. Browser APIs only; the sole dependency is `@blazediff/core`.

> Using React? Reach for [`@blazediff/react`](https://www.npmjs.com/package/@blazediff/react) — it renders from this engine for you.

## Installation

```bash
npm install @blazediff/ui
```

## Renderer

Every mode exposes a `mount*(target, options)` function. It appends the UI into `target` and returns a handle:

```ts
interface MountHandle<Options> {
  update(options: Partial<Options>): void; // change sources/options in place
  destroy(): void; // remove DOM + listeners, abort in-flight loads
}
```

Layout needed for a mode to function (overlay, side-by-side, etc.) is built in — classes are purely for theming.

### Swipe Mode

Drag a divider to compare two images.

```ts
import { mountSwipe } from "@blazediff/ui";

const handle = mountSwipe(document.getElementById("app")!, {
  src1: "before.png",
  src2: "after.png",
  alt1: "Before",
  alt2: "After",
  onPositionChange: (position) => console.log(position), // 0–100
});
```

**Options:** `src1`, `src2`, `alt1` (`"Before"`), `alt2` (`"After"`), `initialPosition` (`50`), `className`, `containerClassName`, `image1ClassName`, `image2ClassName`, `dividerClassName`, `onPositionChange(position)`.

### Difference Mode

Highlights pixel differences using the BlazeDiff algorithm and paints them to a canvas.

```ts
import { mountDifference } from "@blazediff/ui";

mountDifference(document.getElementById("app")!, {
  src1: "before.png",
  src2: "after.png",
  threshold: 0.1,
  includeAA: false,
  alpha: 0.1,
  onDiffComplete: ({ diffCount, totalPixels, percentage }) =>
    console.log(diffCount, percentage),
  onDiffError: (error) => console.error(error),
});
```

**Options:** `src1`, `src2`, `threshold` (`0.1`), `includeAA` (`false`), `alpha` (`0.1`), `crossOrigin` (`"anonymous"`), `className`, `containerClassName`, `canvasClassName`, `onDiffComplete({ diffCount, totalPixels, percentage })`, `onDiffError(error)`.

### Two-Up Mode

Two images side by side, with automatic dimension-change detection.

```ts
import { mountTwoUp } from "@blazediff/ui";

mountTwoUp(document.getElementById("app")!, {
  src1: "before.png",
  src2: "after.png",
  onImagesLoaded: ({ image1, image2 }) => console.log(image1, image2),
  onLoadError: (error) => console.error(error),
});
```

**Options:** `src1`, `src2`, `crossOrigin` (`"anonymous"`), `className`, `containerClassName`, `containerInnerClassName`, `panelClassName`, `imageClassName`, `dimensionInfoClassName`, `onImagesLoaded({ image1, image2 })`, `onLoadError(error)`.

### Onion Skin Mode

Overlays two images with an adjustable-opacity slider — great for spotting small pixel shifts.

```ts
import { mountOnionSkin } from "@blazediff/ui";

mountOnionSkin(document.getElementById("app")!, {
  src1: "before.png",
  src2: "after.png",
  opacity: 50,
  sliderLabelText: "Opacity:",
  onOpacityChange: (opacity) => console.log(opacity), // 0–100
});
```

**Options:** `src1`, `src2`, `opacity` (`50`), `crossOrigin` (`"anonymous"`), `sliderLabelText` (`"Opacity:"`), `className`, `containerClassName`, `imageContainerClassName`, `imageClassName`, `sliderContainerClassName`, `sliderClassName`, `sliderLabelClassName`, `onOpacityChange(opacity)`, `onImagesLoaded({ image1, image2 })`, `onLoadError(error)`.

## Styling

Renderers are unstyled beyond the layout each mode needs. Pass any class strings via the `*ClassName` options — Tailwind, CSS modules, plain CSS, anything:

```ts
mountSwipe(target, {
  src1,
  src2,
  containerClassName: "h-[500px] w-full",
  dividerClassName: "w-1 bg-blue-500",
});
```

## Headless engine

When you need full control — or you're wiring up a framework other than React — drive the engine directly from `@blazediff/ui/engine`. Each factory returns a controller:

```ts
interface Engine<State, Config, Actions> {
  getState(): State;
  subscribe(listener: () => void): () => void;
  setConfig(config: Partial<Config>): void; // reloads only on real changes
  actions: Actions;
  destroy(): void;
}
```

```ts
import { createSwipeEngine } from "@blazediff/ui/engine";

const engine = createSwipeEngine(50);
const unsubscribe = engine.subscribe(() => {
  const { position, isDragging } = engine.getState();
  // render position (0–100) however your framework wants
});

// feed it the already-computed percentage; the engine clamps + guards dragging
engine.actions.start(40);
engine.actions.move(55);
engine.actions.end();

unsubscribe();
engine.destroy();
```

Factories and helpers:

- `createDifferenceEngine(config)` — state `{ status, diff?: { output, width, height, diffCount, totalPixels, percentage }, error? }`. Computes the diff buffer; you paint it.
- `createSwipeEngine(initialPosition = 50)` — state `{ position, isDragging }`; actions `start`/`move`/`end`/`setPosition` (positions are 0–100 percentages).
- `createTwoUpEngine(config)` — state `{ status, dims1, dims2, dimensionLabel, changed, error }`.
- `createOnionSkinEngine(config, initialOpacity = 50)` — state `{ status, opacity, dims1, dims2, error }`; action `setOpacity`.
- Helpers: `formatDimensionLabel`, `normalizedOpacity`, `loadImageElement`, `getImageData`, `createStore`.

The engine uses browser APIs (`Image`, a throwaway `<canvas>` for pixel extraction) but never touches the surface you render to — that boundary is what keeps it framework-agnostic.

## Links

- [GitHub Repository](https://github.com/teimurjan/blazediff)
- [NPM Package](https://www.npmjs.com/package/@blazediff/ui)
- [Examples →](https://blazediff.dev/examples/vanilla-components)
