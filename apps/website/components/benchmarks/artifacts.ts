import data from "../../data/benchmarks.json";
import type { BenchmarkUnit } from "./format";

export interface BenchmarkValue {
	value: number;
	min?: number;
	max?: number;
}

export interface BenchmarkSeries {
	id: string;
	name: string;
	version?: string;
	iterations?: number;
	baseline: boolean;
	ours: boolean;
	/** Set on combined charts, where several series share a name. */
	runtime?: string;
}

export interface BenchmarkRow {
	fixture: string;
	mpx?: number;
	values: Record<string, BenchmarkValue | null>;
}

export interface BenchmarkSection {
	id: string;
	title: string;
	unit: BenchmarkUnit;
	stat: "mean" | "best" | "size";
	note?: string;
	series: BenchmarkSeries[];
	rows: BenchmarkRow[];
}

/** Mirrors `scripts/bench/artifact.js` (schemaVersion 1). */
export interface BenchmarkArtifact {
	schemaVersion: 1;
	key: string;
	category: string;
	generatedAt: string;
	commit: { sha?: string; dirty: boolean };
	env: {
		platform: string;
		arch: string;
		osRelease: string;
		cpu?: string;
		cores: number;
		memoryGb: number;
		node: string;
		rustc?: string;
		python?: string;
	};
	config: {
		iterations?: number;
		warmup?: number;
		method?: string;
		ioIncluded: boolean;
	};
	sections: BenchmarkSection[];
}

/** `<os>-<arch>`, the folder a run is stored under in `benchmarks/results`. */
export type Platform = string;

const ARTIFACTS = data as unknown as Record<
	Platform,
	Record<string, BenchmarkArtifact>
>;

// Mirrors `REFERENCE_PLATFORM` in `scripts/bench/artifact.js`.
export const REFERENCE_PLATFORM: Platform = "darwin-arm64";

const PLATFORM_LABELS: Record<Platform, string> = {
	"linux-x64": "Linux x64",
	"linux-arm64": "Linux arm64",
	"darwin-arm64": "macOS arm64",
	"darwin-x64": "macOS x64",
	"win32-x64": "Windows x64",
};

export const platformLabel = (platform: Platform) =>
	PLATFORM_LABELS[platform] ?? platform;

/** Every platform with results, the reference one first. */
export const PLATFORMS: Platform[] = Object.keys(ARTIFACTS).sort(
	(a, b) =>
		Number(b === REFERENCE_PLATFORM) - Number(a === REFERENCE_PLATFORM) ||
		a.localeCompare(b),
);

/**
 * The run of `key` on `platform`. Without a platform, the reference run, or
 * any other machine's when the reference has none, so a claim keeps its data.
 * Any artifact may be missing (not yet run on this checkout); callers skip it.
 */
export function findArtifact(
	key: string,
	platform?: Platform,
): BenchmarkArtifact | undefined {
	if (platform) return ARTIFACTS[platform]?.[key];
	return PLATFORMS.map((p) => ARTIFACTS[p][key]).find(Boolean);
}

export function findSection(
	key: string,
	sectionId = key,
	platform?: Platform,
): BenchmarkSection | undefined {
	return findArtifact(key, platform)?.sections.find((s) => s.id === sectionId);
}

/** Rows every series measured, so totals compare like with like. */
export function completeRows(section: BenchmarkSection) {
	return section.rows.filter((row) =>
		section.series.every((s) => row.values[s.id]),
	);
}

export function sectionTotals(
	section: BenchmarkSection,
): Record<string, number> {
	const rows = completeRows(section);
	return Object.fromEntries(
		section.series.map((s) => [
			s.id,
			rows.reduce((sum, row) => sum + (row.values[s.id]?.value ?? 0), 0),
		]),
	);
}

export function seriesTotal(
	key: string,
	sectionId: string,
	seriesId: string,
): number | undefined {
	const section = findSection(key, sectionId);
	return section ? sectionTotals(section)[seriesId] : undefined;
}

/**
 * Copy-ready claim from total time, e.g. "~4.6x faster" or "~25% faster", or
 * undefined when the artifact is missing.
 */
export function fasterThan(
	key: string,
	sectionId: string,
	oursId: string,
	theirsId: string,
): string | undefined {
	const ours = seriesTotal(key, sectionId, oursId);
	const theirs = seriesTotal(key, sectionId, theirsId);
	if (!ours || !theirs) return undefined;
	const ratio = theirs / ours;
	if (ratio >= 1.5) return `~${ratio.toFixed(1)}x faster`;
	const pct = Math.round(Math.abs(1 - ours / theirs) * 100);
	return ours <= theirs ? `~${pct}% faster` : `~${pct}% slower`;
}

/** One series taken from a bench, with the label it gets in a combined chart. */
export interface SeriesPick {
	key: string;
	/** Section id inside the artifact; defaults to the bench key. */
	section?: string;
	series: string;
	name?: string;
	runtime?: string;
}

/** One chart that puts series from several benches side by side. */
export interface ChartSpec {
	id: string;
	title: string;
	note?: string;
	/** The first pick is the baseline the others compare against. */
	picks: SeriesPick[];
}

export interface Card {
	id: string;
	artifacts: BenchmarkArtifact[];
	section: BenchmarkSection;
}

/**
 * Builds one section from the picks that exist on `platform`. Totals later use
 * only the fixtures every series measured, so the picks compare like with like.
 */
export function resolveChart(
	spec: ChartSpec,
	platform?: Platform,
): Card | undefined {
	const found = spec.picks.flatMap((pick) => {
		const artifact = findArtifact(pick.key, platform);
		const section = artifact?.sections.find(
			(s) => s.id === (pick.section ?? pick.key),
		);
		const series = section?.series.find((s) => s.id === pick.series);
		return artifact && section && series
			? [{ pick, artifact, section, series }]
			: [];
	});
	if (found.length < 2 || !found.some((f) => f.series.ours)) return undefined;

	const [first] = found;
	const id = ({ pick, section }: (typeof found)[number]) =>
		`${pick.key}/${section.id}/${pick.series}`;
	const rows = new Map<string, BenchmarkRow>();
	for (const f of found) {
		for (const row of f.section.rows) {
			const merged = rows.get(row.fixture) ?? {
				fixture: row.fixture,
				mpx: row.mpx,
				values: {},
			};
			merged.values[id(f)] = row.values[f.pick.series] ?? null;
			rows.set(row.fixture, merged);
		}
	}

	return {
		id: spec.id,
		artifacts: [...new Set(found.map((f) => f.artifact))],
		section: {
			id: spec.id,
			title: spec.title,
			unit: first.section.unit,
			stat: first.section.stat,
			note:
				spec.note ??
				([...new Set(found.map((f) => f.section.note).filter(Boolean))].join(
					" ",
				) ||
					undefined),
			series: found.map((f) => ({
				...f.series,
				id: id(f),
				name: f.pick.name ?? f.series.name,
				runtime: f.pick.runtime,
				iterations: f.series.iterations ?? f.artifact.config.iterations,
				baseline: f === first,
			})),
			rows: [...rows.values()],
		},
	};
}

/** Every section of one bench as its own chart, its baseline first. */
export function keyCards(key: string, platform?: Platform): Card[] {
	const artifact = findArtifact(key, platform);
	if (!artifact) return [];
	return artifact.sections.flatMap((section) => {
		const series = [...section.series].sort(
			(a, b) => Number(b.baseline) - Number(a.baseline),
		);
		const card = resolveChart(
			{
				id: `${key}-${section.id}`,
				title: section.title,
				picks: series.map((s) => ({ key, section: section.id, series: s.id })),
			},
			platform,
		);
		return card ? [card] : [];
	});
}
