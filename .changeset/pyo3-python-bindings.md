---
"@blazediff/core-native": minor
---

Add PyO3 Python bindings: `pip install blazediff` now ships the same Rust diff engine as the native binary, via abi3 wheels for macOS, Linux (manylinux 2014), and Windows. Public API mirrors NAPI (`compare`, `interpret_images`).
