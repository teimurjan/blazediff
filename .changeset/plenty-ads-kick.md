---
"@blazediff/matcher": minor
"@blazediff/jest": patch
"@blazediff/vitest": patch
"@blazediff/bun": patch
---

Add worker thread support for better performance

- Add `runInWorker` option (default: `true`) to offload image I/O and comparison to worker threads
- Direct PNG buffer write optimization for first-run snapshots
- Fix ESM compatibility with proper `__dirname` shim
- Graceful fallback to in-process execution when worker unavailable
