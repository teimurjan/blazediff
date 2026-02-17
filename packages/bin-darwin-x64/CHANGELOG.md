# @blazediff/bin-darwin-x64

## 3.4.0

### Minor Changes

- 9cafd0c: Performance optimizations achieving ~63% faster diffs vs ODiff (weighted average):

  - Add optimized grayscale fill with f32 math, loop unrolling (4 pixels/iteration), and constant hoisting
  - Fix memory leak in PNG encoding (proper `libc::free` after `spng_get_png_buffer`)

## 3.3.0

## 3.2.0

### Minor Changes

- db69eff: Remove fail on layout option from bin because we have layout check in the diff function anyway

## 3.1.1

## 3.1.0

### Minor Changes

- f3ff5dc: Include N-API bindings to avoid spawning processes

## 3.0.0
