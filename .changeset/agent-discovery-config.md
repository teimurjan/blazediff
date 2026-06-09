---
"@blazediff/agent": minor
---

Make route discovery configurable and respect config defaults.

`discover` now reads its settings (`maxRoutes`, `sampleTemplates`, `sampleThreshold`, `samplesPerTemplate`) from the `discovery` block in your config, with precedence of explicit CLI flag > config > built-in default. `onboard` gains a `--no-sample-templates` flag so you can capture every reachable route from scratch instead of sampling template groups.
