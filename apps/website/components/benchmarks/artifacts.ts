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

const ARTIFACTS = data as unknown as Record<string, BenchmarkArtifact>;

// Any artifact may be missing (not yet run on this checkout); callers skip it.
export function findArtifact(key: string): BenchmarkArtifact | undefined {
	return ARTIFACTS[key];
}

export function findSection(
	key: string,
	sectionId = key,
): BenchmarkSection | undefined {
	return findArtifact(key)?.sections.find((s) => s.id === sectionId);
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

/**
 * One chart over several benches that measured the same thing, e.g. odiff and
 * honeydiff each run against core-native. A series that several benches share
 * (BlazeDiff, measured in each run) keeps the first bench's measurement.
 */
export function mergeSections(
	id: string,
	title: string,
	sections: BenchmarkSection[],
): BenchmarkSection {
	const [first] = sections;
	const owner = new Map<string, BenchmarkSection>();
	for (const section of sections) {
		for (const s of section.series) {
			if (!owner.has(s.id)) owner.set(s.id, section);
		}
	}
	const series = [...owner.entries()].map(([seriesId, section]) => {
		const s = section.series.find((x) => x.id === seriesId);
		if (!s) throw new Error(`Series "${seriesId}" vanished while merging.`);
		return { ...s, baseline: s.baseline && section === first };
	});

	const values = new Map<string, BenchmarkRow>();
	for (const section of sections) {
		for (const row of section.rows) {
			const merged = values.get(row.fixture) ?? {
				fixture: row.fixture,
				mpx: row.mpx,
				values: {},
			};
			for (const [seriesId, value] of Object.entries(row.values)) {
				if (owner.get(seriesId) === section) merged.values[seriesId] = value;
			}
			values.set(row.fixture, merged);
		}
	}

	return {
		id,
		title,
		unit: first.unit,
		stat: first.stat,
		note: sections
			.map((s) => s.note)
			.filter(Boolean)
			.join(" "),
		// Competitors first, then BlazeDiff, each in source order.
		series: [...series.filter((s) => !s.ours), ...series.filter((s) => s.ours)],
		rows: [...values.values()].sort((a, b) =>
			a.fixture.localeCompare(b.fixture),
		),
	};
}
