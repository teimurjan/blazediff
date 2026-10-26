---
"@blazediff/rust-png": patch
---

Mask a gray tRNS key to the image bit depth before the decoder compares it, as PNG 3rd edition (11.3.1.1) requires. spng compares the full 16-bit value, so a key with bits set above the bit depth never matched, and those pixels stayed opaque. They now decode as transparent, as in image-rs. Only files from encoders that do not zero the unused bits are affected.
