---
"@blazediff/interpret-native": minor
"@blazediff/rust-interpret": minor
---

Interpret accuracy overhaul: chroma-plane statistics on every region (`chroma`) and raw background distances in signals; chroma-coherence recolor rules for photographic edits; patch-correlation shift matching; census-scaled detection noise floor with fragment merging and margined bboxes. Verification macro F1 (classifier-only): addition_deletion 0.998 → 1.000, shift 0.813 → 1.000, html_color_pairs 0.993 → 1.000, inpaintcoco 0.440 → 0.718; end-to-end error cut ≥ 40% on every dataset.
