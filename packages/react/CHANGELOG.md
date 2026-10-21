# @blazediff/react

## 1.9.0

### Minor Changes

- 364187d: Add a hover zoom to two-up mode, and a note-style review page in the agent.

  `mountTwoUp` and `<TwoUpMode />` take a `zoom` magnification. When you hover
  either image, a popup shows both images magnified at the same pixel. The popup
  follows the pointer and flips at the viewport edges. The two-up engine gains
  `hover` and `leave` actions and a `zoom` state field. The pure helpers
  `toTwoUpHover`, `zoomPaneStyle` and `placeZoomPopup` are exported from
  `@blazediff/ui/engine`.

  `blazediff-agent review` is now a single page that reads like a note. Each
  change has a view select for side by side (with the zoom), swipe and difference,
  built from `@blazediff/react`. Decisions are saved when you finish the review.

### Patch Changes

- Updated dependencies [364187d]
  - @blazediff/ui@2.2.0

## 1.8.0

### Minor Changes

- 36c2914: Accept image URLs or encoded `Uint8Array` values as comparison sources.

  Difference mode now accepts precomputed diff image bytes and renders them without running BlazeDiff in the browser.

### Patch Changes

- Updated dependencies [36c2914]
  - @blazediff/ui@2.1.0

## 1.7.0

### Minor Changes

- 723e24c: Rework the diff UI around a framework-agnostic headless engine.

  `@blazediff/ui` no longer ships Web Components. State, calculations, and handlers now live in a headless engine exported from `@blazediff/ui/engine` (`createDifferenceEngine`/`createSwipeEngine`/`createTwoUpEngine`/`createOnionSkinEngine`), and the main entry is a tiny pure-JS renderer (`mountDifference`/`mountSwipe`/`mountTwoUp`/`mountOnionSkin`). The `<blazediff-*>` custom elements and `class-*` attributes are removed — use the mount functions and `*ClassName` options instead. This is a breaking change.

  `@blazediff/react` now renders from the same engine instead of wrapping custom elements. Component names and props are unchanged.

### Patch Changes

- Updated dependencies [723e24c]
  - @blazediff/ui@2.0.0

## 1.6.6

### Patch Changes

- @blazediff/ui@1.6.6

## 1.6.5

### Patch Changes

- @blazediff/ui@1.6.5

## 1.6.4

### Patch Changes

- 7166ff6: Remove duplicated .d.mts type declaration files
- Updated dependencies [7166ff6]
  - @blazediff/ui@1.6.4

## 1.6.3

### Patch Changes

- @blazediff/ui@1.6.3

## 1.6.2

### Patch Changes

- @blazediff/ui@1.6.2

## 1.6.1

### Patch Changes

- @blazediff/ui@1.6.1

## 1.6.0

### Patch Changes

- @blazediff/ui@1.6.0

## 1.5.0

### Patch Changes

- Updated dependencies [967eb66]
  - @blazediff/ui@1.5.0

## 1.4.1

### Patch Changes

- @blazediff/ui@1.4.1

## 1.4.0

### Patch Changes

- @blazediff/ui@1.4.0

## 1.3.0

### Patch Changes

- @blazediff/ui@1.3.0

## 1.2.0

### Patch Changes

- @blazediff/ui@1.2.0
