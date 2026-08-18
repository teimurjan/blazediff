# @blazediff/rust-interpret

## 6.2.0

### Minor Changes

- 5b9f7f8: Density-gate the region bbox merge so distinct nearby changes stay separate. Proximity-only merging chained neighbouring edits on dense screenshots — a map's whole lower half collapsed into one `ContentChange` that hid the additions and deletions inside it. A merge is now refused unless the enclosing box is mostly touched by a sub-threshold change-density map, which keeps one fragmented change together while splitting two changes with untouched background between them. `merge_overlapping_components` takes a `&ChangeDensity` argument. End-to-end macro F1: shift 0.799 → 0.801, inpaintcoco 0.488 → 0.492, addition_deletion unchanged, html_color_pairs 0.874 → 0.868.

## 6.1.0

### Minor Changes

- 2d09fea: Interpret accuracy overhaul: chroma-plane statistics on every region (`chroma`) and raw background distances in signals; chroma-coherence recolor rules for photographic edits; patch-correlation shift matching; census-scaled detection noise floor with fragment merging and margined bboxes. Verification macro F1 (classifier-only): addition_deletion 0.998 → 1.000, shift 0.813 → 1.000, html_color_pairs 0.993 → 1.000, inpaintcoco 0.440 → 0.718; end-to-end error cut ≥ 40% on every dataset.

## 6.0.0
