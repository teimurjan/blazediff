---
"@blazediff/core-native": patch
---

Rebuild Linux .node files without CPython symbol contamination so Node.js can dlopen them on Linux. Emit camelCase fields and kebab-case enum values from the CLI interpret JSON path so the `tryLoadNativeBinding` fallback parses into the typed `InterpretResult` shape.
