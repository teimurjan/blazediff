---
"@blazediff/cli": major
"@blazediff/core-native": major
"@blazediff/matcher": major
"@blazediff/bun": patch
"@blazediff/jest": patch
"@blazediff/vitest": patch
---

Drop the HTML diff output format. Removes `--output-format` from `blazediff-cli`, `outputFormat` from `@blazediff/core-native`'s `BlazeDiffOptions` and `@blazediff/matcher`'s `MatcherOptions`, and the embedded `html_report` module from the rust crate. The interpret report is now produced by `@blazediff/agent`'s review webapp instead of being inlined into the diff path. README docs for `bun`/`jest`/`vitest` are synced to match.
