---
"@blazediff/core": patch
---

Fix crash when `null` is passed as the output buffer. `diff` now treats `null` and `undefined` identically (count-only), matching pixelmatch's API.
