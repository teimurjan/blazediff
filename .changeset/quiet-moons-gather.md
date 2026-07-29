---
"@blazediff/core": minor
---

Reject below-threshold pixels with integer math before the YIQ pipeline

The YIQ metric is a positive-definite quadratic form, so `Δr² + Δg² + Δb² ≤
maxDelta / λmax` proves a pixel is under threshold without running the float
metric. Opaque pixels also read their channels out of the 32-bit word already
loaded for the equality test. Diff counts and output images are unchanged.
