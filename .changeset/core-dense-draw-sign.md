---
"@blazediff/core": patch
---

Draw dense diffs faster: the draw step reuses the luma sign from the candidate scan instead of calling `brightnessDelta` again. Output bytes are unchanged.
