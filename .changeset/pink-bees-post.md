---
"@blazediff/bin-darwin-arm64": minor
"@blazediff/bin-linux-arm64": minor
"@blazediff/bin-win32-arm64": minor
"@blazediff/bin-darwin-x64": minor
"@blazediff/bin-linux-x64": minor
"@blazediff/bin-win32-x64": minor
---

Performance optimizations achieving ~63% faster diffs vs ODiff (weighted average):

- Add optimized grayscale fill with f32 math, loop unrolling (4 pixels/iteration), and constant hoisting
- Fix memory leak in PNG encoding (proper `libc::free` after `spng_get_png_buffer`)
