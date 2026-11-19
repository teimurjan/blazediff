---
"@blazediff/core": patch
"@blazediff/core-native": patch
"@blazediff/core-wasm": patch
---

Move the shared diff API (types, `BlazeDiffError`, argument checks, `windowSide`) to the new `@blazediff/contract` package. `@blazediff/core` re-exports all of it unchanged. `@blazediff/core-native` and `@blazediff/core-wasm` now depend on `@blazediff/contract` instead of `@blazediff/core`, so a change to the JS engine no longer releases them.
