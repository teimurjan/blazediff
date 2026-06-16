# @blazediff/react

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
