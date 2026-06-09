---
"@blazediff/ui": major
"@blazediff/react": minor
---

Rework the diff UI around a framework-agnostic headless engine.

`@blazediff/ui` no longer ships Web Components. State, calculations, and handlers now live in a headless engine exported from `@blazediff/ui/engine` (`createDifferenceEngine`/`createSwipeEngine`/`createTwoUpEngine`/`createOnionSkinEngine`), and the main entry is a tiny pure-JS renderer (`mountDifference`/`mountSwipe`/`mountTwoUp`/`mountOnionSkin`). The `<blazediff-*>` custom elements and `class-*` attributes are removed — use the mount functions and `*ClassName` options instead. This is a breaking change.

`@blazediff/react` now renders from the same engine instead of wrapping custom elements. Component names and props are unchanged.
