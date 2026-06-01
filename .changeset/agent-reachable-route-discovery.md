---
"@blazediff/agent": minor
---

Route discovery now mirrors a real user: `discover` crawls links from the landing page and returns only reachable routes. The Next.js manifest scan and `/sitemap.xml` fetch are removed (a route no page links to is excluded), and the crawl waits for client-rendered nav before reading links. Large list→detail template groups (e.g. `/blog/*`) are sampled to a couple representatives instead of enumerated; tune with `--samples-per-template` / `--sample-threshold` or disable via `--no-sample-templates`. The SKILL.md authoring flow is updated to use the crawl as the primary discovery source instead of reading router folder structure.
