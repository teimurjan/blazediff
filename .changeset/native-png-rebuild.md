---
"@blazediff/core-native": patch
"@blazediff/ssim-native": patch
"@blazediff/interpret-native": patch
"@blazediff/milo-native": patch
---

Rebuild against the updated `blazediff-png` codec. With `BLAZEDIFF_PNG_ENABLED` set, PNG decode is faster, and a gray tRNS key is masked to the image bit depth as the PNG specification requires. The default spng path is unchanged.
