---
"@blazediff/core": patch
"@blazediff/contract": patch
---

Ship `.d.mts` declarations for the `import` condition, so ESM consumers on `moduleResolution: node16`/`nodenext` get ESM types instead of CommonJS ones. `import pixelmatch from "@blazediff/core/pixelmatch"` now typechecks there.
