/**
 * Pure text helpers for the local judge's step-1 read-and-diff strategy.
 *
 * Moondream is asked to *read* each side of a changed region separately (it is
 * far more accurate reading one tight crop than comparing two — the comparison
 * framing makes it invent differences). These helpers turn the two noisy reads
 * into a clean, deterministic statement of what text actually changed, so the
 * weak models never have to diff text themselves.
 */

/**
 * Words Moondream sprinkles into a "read the text" answer — scene description
 * that is not part of the UI text ("the word X is written on a white
 * background…"). Stripped from the prose-fallback diff so they don't masquerade
 * as added/removed content. Any token containing a digit is always kept.
 */
const FILLER = new Set([
	"the",
	"a",
	"an",
	"is",
	"are",
	"was",
	"were",
	"be",
	"this",
	"that",
	"these",
	"those",
	"it",
	"its",
	"there",
	"here",
	"and",
	"or",
	"but",
	"of",
	"in",
	"on",
	"at",
	"to",
	"with",
	"within",
	"against",
	"around",
	"surrounding",
	"into",
	"from",
	"by",
	"for",
	"as",
	"no",
	"not",
	"other",
	"some",
	"also",
	"another",
	"word",
	"words",
	"text",
	"letter",
	"letters",
	"character",
	"characters",
	"number",
	"numbers",
	"digit",
	"digits",
	"phrase",
	"label",
	"title",
	"written",
	"writes",
	"reads",
	"read",
	"says",
	"displayed",
	"displays",
	"display",
	"shows",
	"show",
	"showing",
	"shown",
	"appears",
	"appear",
	"reading",
	"prominently",
	"visible",
	"positioned",
	"located",
	"white",
	"black",
	"blue",
	"red",
	"green",
	"purple",
	"gray",
	"grey",
	"background",
	"foreground",
	"color",
	"colors",
	"colored",
	"colour",
	"font",
	"style",
	"styled",
	"bold",
	"italic",
	"blurred",
	"slightly",
	"image",
	"photo",
	"picture",
	"frame",
	"scene",
	"object",
	"objects",
	"element",
	"elements",
	"ui",
	"screen",
	"page",
	"logo",
	"icon",
	"button",
	"large",
	"small",
	"big",
	"left",
	"right",
	"top",
	"bottom",
	"center",
	"corner",
	"side",
	"above",
	"below",
	"ink",
	"company",
	"name",
	"brand",
	"create",
	"creating",
	"artistic",
	"effect",
	"design",
	"additional",
]);

/** Lowercased word/number tokens. */
export function tokenize(text: string): string[] {
	return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Pull the literal text Moondream read out of its prose. The model wraps the
 * read text in quotes (`the word "Nimbus 123" is written…`), so the longest
 * quoted span is the cleanest signal; null when it didn't quote anything.
 */
export function extractQuoted(read: string): string | null {
	const spans = [...read.matchAll(/["“”']([^"“”']+)["“”']/g)].map((m) =>
		m[1].trim(),
	);
	if (spans.length === 0) return null;
	return spans.reduce((a, b) => (b.length > a.length ? b : a)).trim() || null;
}

export interface TokenDiff {
	inserted: string[];
	removed: string[];
}

/**
 * Word-level diff (LCS backtrace) of `actual` against `base`: tokens present in
 * the updated read but not the original are `inserted`, and vice versa. With a
 * tight crop both reads share Moondream's prose scaffold, so it cancels and only
 * the genuine change survives.
 */
export function diffTokens(base: string[], actual: string[]): TokenDiff {
	const n = base.length;
	const m = actual.length;
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array(m + 1).fill(0),
	);
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			dp[i][j] =
				base[i] === actual[j]
					? dp[i + 1][j + 1] + 1
					: Math.max(dp[i + 1][j], dp[i][j + 1]);
		}
	}
	const inserted: string[] = [];
	const removed: string[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (base[i] === actual[j]) {
			i++;
			j++;
		} else if (dp[i + 1][j] >= dp[i][j + 1]) {
			removed.push(base[i++]);
		} else {
			inserted.push(actual[j++]);
		}
	}
	while (i < n) removed.push(base[i++]);
	while (j < m) inserted.push(actual[j++]);
	return { inserted, removed };
}

const keepToken = (t: string): boolean => /\d/.test(t) || !FILLER.has(t);

const quote = (tokens: string[]): string => `"${tokens.join(" ")}"`;

/**
 * Turn two reads of the same region into one sentence stating what text changed.
 * Prefers diffing the quoted spans (clean); falls back to filtering scene-words
 * out of a full-prose diff. `changeType` only steers the phrasing.
 */
export function describeRegionChange(
	changeType: string,
	baseRead: string,
	actualRead: string,
): string {
	const baseQuoted = extractQuoted(baseRead);
	const actualQuoted = extractQuoted(actualRead);
	const haveCores = baseQuoted !== null && actualQuoted !== null;

	const base = tokenize(baseQuoted ?? baseRead);
	const actual = tokenize(actualQuoted ?? actualRead);
	const { inserted, removed } = diffTokens(base, actual);

	// Quoted cores are clean; only the prose fallback needs filler stripping.
	const ins = haveCores ? inserted : inserted.filter(keepToken);
	const rem = haveCores ? removed : removed.filter(keepToken);

	const updated =
		actualQuoted && actualQuoted.length <= 60
			? ` (region now reads "${actualQuoted}")`
			: "";

	if (ins.length > 0 && rem.length === 0)
		return `added ${quote(ins)}${updated}`;
	if (rem.length > 0 && ins.length === 0)
		return `removed ${quote(rem)}${updated}`;
	if (ins.length > 0 && rem.length > 0)
		return `replaced ${quote(rem)} with ${quote(ins)}${updated}`;

	// No token-level delta: reads matched. Report the visual change neutrally.
	const kind = changeType.replace(/-/g, " ");
	return `${kind} with no readable text change${updated}`;
}
