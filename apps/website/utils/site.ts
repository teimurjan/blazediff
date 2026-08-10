export const SITE_URL = "https://blazediff.dev";

export const SITE_NAME = "BlazeDiff";

export const SITE_TITLE =
	"BlazeDiff. Visual regression with an agent-in-the-loop.";

export const SITE_DESCRIPTION =
	"Open-source visual regression for JS. Deterministic Rust + JS diff cores (3 to 8x faster than pixelmatch and odiff on 4K), SSIM/GMSD metrics, and an agent that hands ambiguous diffs to Claude Code, Cursor, or Codex. No SaaS, no API key.";

export const REPO_URL = "https://github.com/teimurjan/blazediff";

export const AUTHOR_NAME = "Teimur Gasanov";

export const AUTHOR_URL = "https://github.com/teimurjan";

/**
 * External hubs that identify the same BlazeDiff entity, used for schema.org
 * `sameAs`. Every entry must resolve — a dead profile weakens the link rather
 * than strengthening it.
 */
export const SAME_AS = [
	REPO_URL,
	AUTHOR_URL,
	"https://www.npmjs.com/package/@blazediff/core",
];
