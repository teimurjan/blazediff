import { fixtureUrl } from "../utils/fixtures";

export interface FixturePair {
	/** `"<group>/<n>"`, stable across renders and used as the select value. */
	id: string;
	/** Fixture directory; doubles as the `<optgroup>` label. */
	group: string;
	/** What the pair demonstrates, shown in the option. */
	label: string;
	a: string;
	b: string;
	/**
	 * Intrinsic dimensions, hardcoded because the files are committed and
	 * static. Knowing them before any byte is fetched is what lets the preview
	 * reserve the right aspect ratio and the heavy-pair gate fire up front.
	 */
	width: number;
	height: number;
}

interface Spec {
	n: number;
	label: string;
	width: number;
	height: number;
}

function pairs(group: string, extension: string, specs: Spec[]): FixturePair[] {
	return specs.map(({ n, label, width, height }) => ({
		id: `${group}/${n}`,
		group,
		label,
		a: fixtureUrl(group, `${n}a.${extension}`),
		b: fixtureUrl(group, `${n}b.${extension}`),
		width,
		height,
	}));
}

/**
 * Every fixture pair the browser can actually analyze, cheapest first.
 *
 * `fixtures/4k-qoi` is left out because no browser decodes QOI, and
 * `fixtures/4k` because its PNGs run 15-29 MB each — `fixtures/4k-jpeg` holds
 * the same three scenes at a tenth of the weight.
 */
export const INTERPRET_FIXTURES: FixturePair[] = [
	...pairs("blazediff", "png", [
		{ n: 1, label: "UI banner, text edit", width: 1468, height: 294 },
		{ n: 2, label: "Card, small layout shift", width: 552, height: 636 },
		{ n: 3, label: "Landing page, mixed edits", width: 1328, height: 1228 },
		{ n: 4, label: "Tall page, content swap", width: 1320, height: 2868 },
	]),
	...pairs("pixelmatch", "png", [
		{ n: 1, label: "Classic pixelmatch pair", width: 512, height: 256 },
		{ n: 2, label: "Photo, compression noise", width: 256, height: 256 },
		{ n: 3, label: "Anti-aliased edges", width: 512, height: 256 },
		{ n: 4, label: "Map tile", width: 438, height: 412 },
		{ n: 5, label: "Gradient", width: 256, height: 256 },
		{ n: 6, label: "Sub-pixel text", width: 256, height: 256 },
		{ n: 7, label: "Chart", width: 500, height: 500 },
	]),
	...pairs("alpha", "png", [
		{ n: 1, label: "Transparency", width: 192, height: 192 },
	]),
	...pairs("same", "png", [
		{
			n: 1,
			label: "Identical pixels, different metadata",
			width: 1498,
			height: 1160,
		},
	]),
	...pairs("4k-jpeg", "jpg", [
		{ n: 1, label: "4K photo (17.9 MP)", width: 5600, height: 3200 },
		{ n: 2, label: "4K photo (20.0 MP)", width: 5472, height: 3648 },
		{ n: 3, label: "4K photo (24.0 MP)", width: 6000, height: 4000 },
	]),
	...pairs("page", "png", [
		{
			n: 1,
			label: "Full-page screenshot (58.9 MP)",
			width: 3598,
			height: 16384,
		},
		{
			n: 2,
			label: "Full-page screenshot (41.7 MP)",
			width: 3000,
			height: 13904,
		},
	]),
];

/** The pair the demo opens on — small, and rich enough to show every column. */
export const DEFAULT_PAIR_ID = "blazediff/3";

/**
 * An image against itself. Not in the list above: it is the worked example for
 * the "nothing changed" case rather than something to browse to.
 */
export const IDENTICAL_PAIR: FixturePair = {
	id: "blazediff/3-identical",
	group: "blazediff",
	label: "Identical images",
	a: fixtureUrl("blazediff", "3a.png"),
	b: fixtureUrl("blazediff", "3a.png"),
	width: 1328,
	height: 1228,
};

/**
 * Above this, analysis is gated behind an explicit click. A 25 MP pair already
 * means ~100 MB of RGBA per image and several seconds of work; the two `page`
 * fixtures go well past that.
 */
export const HEAVY_MEGAPIXELS = 25;

export const megapixels = (pair: FixturePair) =>
	(pair.width * pair.height) / 1e6;

export const isHeavy = (pair: FixturePair) =>
	megapixels(pair) > HEAVY_MEGAPIXELS;

const BY_ID = new Map<string, FixturePair>(
	[...INTERPRET_FIXTURES, IDENTICAL_PAIR].map((pair) => [pair.id, pair]),
);

export const findPair = (id: string): FixturePair | undefined => BY_ID.get(id);

/** Pairs bucketed by fixture directory, preserving the order above. */
export function groupPairs(items: FixturePair[]): [string, FixturePair[]][] {
	const groups: [string, FixturePair[]][] = [];
	for (const pair of items) {
		const last = groups[groups.length - 1];
		if (last && last[0] === pair.group) {
			last[1].push(pair);
			continue;
		}
		groups.push([pair.group, [pair]]);
	}
	return groups;
}
