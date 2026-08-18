---
"@blazediff/interpret-native": minor
"@blazediff/rust-interpret": minor
---

Density-gate the region bbox merge so distinct nearby changes stay separate. Proximity-only merging chained neighbouring edits on dense screenshots — a map's whole lower half collapsed into one `ContentChange` that hid the additions and deletions inside it. A merge is now refused unless the enclosing box is mostly touched by a sub-threshold change-density map, which keeps one fragmented change together while splitting two changes with untouched background between them. `merge_overlapping_components` takes a `&ChangeDensity` argument. End-to-end macro F1: shift 0.799 → 0.801, inpaintcoco 0.488 → 0.492, addition_deletion unchanged, html_color_pairs 0.874 → 0.868.
