---
"@blazediff/core-native": minor
---

Improve interpret classification with dual-image gradient comparison, color delta uniformity analysis, and expanded noise filtering. ColorChange detection now measures edge correlation between both images instead of single-image edge score. New `edge_score_img2`, `edge_correlation`, and `delta_stddev` fields in interpret output. Fix HTML report overlay extending past image bounds on bottom regions.
