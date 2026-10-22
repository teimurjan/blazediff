import {
	fasterThan,
	findArtifact,
	findSection,
	seriesTotal,
} from "./artifacts";
import type { BenchmarkGroup } from "./benchmark-chart";

interface TeaserBar {
	label: string;
	key: string;
	seriesId: string;
	highlight?: boolean;
}

interface TeaserSpec {
	id: string;
	title: string;
	/** The artifact whose fixtures, IO mode and runs the subtitle describes. */
	key: string;
	bars: TeaserBar[];
}

const TEASERS: TeaserSpec[] = [
	{
		id: "js",
		title: "JS CORE VS PIXELMATCH VS WASM CORE",
		key: "core",
		bars: [
			{ label: "pixelmatch", key: "core", seriesId: "pixelmatch" },
			{
				label: "@blazediff/core",
				key: "core",
				seriesId: "blazediff",
				highlight: true,
			},
			{
				label: "@blazediff/core-wasm",
				key: "core-wasm",
				seriesId: "blazediff-core-wasm",
				highlight: true,
			},
		],
	},
	{
		id: "native",
		title: "NATIVE BINARY VS ODIFF VS HONEYDIFF",
		key: "core-native",
		bars: [
			{ label: "odiff", key: "core-native", seriesId: "odiff" },
			{ label: "honeydiff", key: "honeydiff", seriesId: "honeydiff" },
			{
				label: "@blazediff/core-native",
				key: "core-native",
				seriesId: "blazediff",
				highlight: true,
			},
		],
	},
];

function subtitle(key: string) {
	const artifact = findArtifact(key);
	const section = findSection(key);
	if (!artifact || !section) return "";
	const { ioIncluded, iterations } = artifact.config;
	return `${section.rows.length} FIXTURES · IO ${ioIncluded ? "INCLUDED" : "EXCLUDED"} · ${iterations} RUNS`;
}

/**
 * The homepage's headline groups, read from whichever artifacts exist. A bar
 * without data is dropped, and so is a group with nothing left to compare.
 */
export function teaserGroups(): BenchmarkGroup[] {
	return TEASERS.flatMap((spec) => {
		const bars = spec.bars.flatMap(({ label, key, seriesId, highlight }) => {
			const value = seriesTotal(key, key, seriesId);
			return value === undefined ? [] : [{ label, value, highlight }];
		});
		if (bars.length < 2) return [];
		return [
			{
				id: spec.id,
				title: spec.title,
				subtitle: subtitle(spec.key),
				unit: "ms" as const,
				bars,
			},
		];
	});
}

/** CPU of the run behind the headline numbers, for the section intro. */
export function teaserMachine() {
	const artifact = findArtifact("core") ?? findArtifact("core-native");
	return artifact?.env.cpu ?? "the reference machine";
}

type Rival = [key: string, oursId: string, theirsId: string, label: string];

// "~4.6x faster than odiff and ~3.1x faster than honeydiff"; undefined when no
// rival has data.
function versus(...rivals: Rival[]) {
	const parts = rivals.flatMap(([key, oursId, theirsId, label]) => {
		const speed = fasterThan(key, key, oursId, theirsId);
		return speed ? [`${speed} than ${label}`] : [];
	});
	return parts.length ? parts.join(" and ") : undefined;
}

/** Speed claims for marketing copy, so prose never drifts from the data. */
export const SPEED_CLAIMS = {
	core: versus(["core", "blazediff", "pixelmatch", "pixelmatch"]),
	wasm: versus([
		"core-wasm",
		"blazediff-core-wasm",
		"pixelmatch",
		"pixelmatch",
	]),
	native: versus(
		["core-native", "blazediff", "odiff", "odiff"],
		["honeydiff", "blazediff", "honeydiff", "honeydiff"],
	),
	ssim: versus(["ssim", "blazediff", "ssim-js", "ssim.js"]),
	hitchhikers: versus(["hitchhikers-ssim", "blazediff", "ssim-js", "ssim.js"]),
	object: versus(["object", "blazediff", "microdiff", "microdiff"]),
};

/** "Subject claim." for a claim that has data, otherwise nothing. */
export function claim(subject: string, speed: string | undefined) {
	return speed ? `${subject} ${speed}.` : "";
}

/** Join sentences, skipping the claims that had no data. */
export function prose(...sentences: string[]) {
	return sentences.filter(Boolean).join(" ");
}
