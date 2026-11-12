import {
	type BenchmarkArtifact,
	type BenchmarkSection,
	type BenchmarkSeries,
	completeRows,
	sectionTotals,
} from "./artifacts";
import ColumnChart from "./column-chart";
import FixtureTable from "./fixture-table";
import { formatValue } from "./format";
import InlineCode from "./inline-code";
import SeriesTable from "./series-table";

const REPO_URL = "https://github.com/teimurjan/blazediff";

const STAT_LABELS: Record<BenchmarkSection["stat"], string> = {
	mean: "TOTAL TIME",
	best: "TOTAL TIME, BEST-OF",
	size: "TOTAL OUTPUT SIZE",
};

function chartSubtitle(artifact: BenchmarkArtifact, section: BenchmarkSection) {
	const { ioIncluded } = artifact.config;
	// Sides can run a different number of times (pure-Python pixelmatch runs 10).
	const runs = [
		...new Set(
			section.series.map((s) => s.iterations ?? artifact.config.iterations),
		),
	].filter(Boolean);
	return [
		`${completeRows(section).length} FIXTURES`,
		section.stat === "mean" && runs.length
			? `MEAN OF ${runs.join(" OR ")} RUNS`
			: null,
		section.unit === "ms" ? `IO ${ioIncluded ? "INCLUDED" : "EXCLUDED"}` : null,
	]
		.filter(Boolean)
		.join(" · ");
}

function RunMeta({ artifact }: { artifact: BenchmarkArtifact }) {
	const { env, commit, config } = artifact;
	const sha = commit.sha?.slice(0, 7);
	const parts = [
		env.cpu,
		`${env.platform}/${env.arch}`,
		`Node ${env.node}`,
		env.rustc,
		env.python,
		config.method,
		new Date(artifact.generatedAt).toISOString().slice(0, 10),
	].filter(Boolean);

	return (
		<p className="font-mono text-[12px] text-muted leading-relaxed">
			<code className="text-fg">pnpm benchmark {artifact.key}</code>
			{" · "}
			{parts.join(" · ")}
			{sha && (
				<>
					{" · "}
					<a
						href={`${REPO_URL}/commit/${commit.sha}`}
						target="_blank"
						rel="noopener noreferrer"
						className="underline hover:text-fg"
					>
						{sha}
						{commit.dirty ? "-dirty" : ""}
					</a>
				</>
			)}
		</p>
	);
}

/** Time reads as a speedup; size as a share of the other side's bytes. */
export function versus(
	section: BenchmarkSection,
	subject: number,
	other: number,
) {
	if (section.unit === "bytes")
		return `${((subject / other) * 100).toFixed(1)}%`;
	const ratio = other / subject;
	return ratio >= 1
		? `${ratio.toFixed(2)}x faster`
		: `${(1 / ratio).toFixed(2)}x slower`;
}

/** Fastest (or smallest) first, so the chart and the table read as a ranking. */
function ranked(section: BenchmarkSection) {
	const totals = sectionTotals(section);
	const baseline = section.series.find((s) => s.baseline) ?? section.series[0];
	const series = [...section.series].sort(
		(a, b) => totals[a.id] - totals[b.id],
	);
	return { totals, baseline, series };
}

function Legend() {
	return (
		<div className="flex flex-wrap gap-4 font-mono text-[11px] uppercase text-muted">
			<span className="flex items-center gap-2">
				<span className="h-2.5 w-2.5 rounded-sm bg-accent" />
				BlazeDiff
			</span>
			<span className="flex items-center gap-2">
				<span className="h-2.5 w-2.5 rounded-sm bg-muted/50" />
				Other libraries
			</span>
			<span>Lower is better</span>
		</div>
	);
}

const barComparison = (
	section: BenchmarkSection,
	s: BenchmarkSeries,
	baseline: BenchmarkSeries,
	totals: Record<string, number>,
) =>
	s.id === baseline.id
		? "baseline"
		: section.unit === "bytes"
			? `${versus(section, totals[s.id], totals[baseline.id])} of ${baseline.name}'s size`
			: `${versus(section, totals[s.id], totals[baseline.id])} than ${baseline.name}`;

export default function BenchmarkSectionCard({
	artifacts,
	section,
	size,
}: {
	/** Every bench the chart draws from; a combined chart has several. */
	artifacts: BenchmarkArtifact[];
	section: BenchmarkSection;
	/** Output sizes of the same series, shown beside their times. */
	size?: BenchmarkSection;
}) {
	const { totals, baseline, series } = ranked(section);
	const sizes = size && sectionTotals(size);
	const sizeOf = (id: string) => {
		if (!size || !sizes || sizes[id] === undefined) return {};
		return {
			size: formatValue(sizes[id], "bytes"),
			sizeVersus:
				id === baseline.id
					? "baseline"
					: versus(size, sizes[id], sizes[baseline.id]),
		};
	};
	return (
		<article className="flex min-w-0 flex-col gap-6 border border-line bg-surface p-6">
			<header className="flex flex-col gap-2">
				<h4 className="font-sans text-[16px] text-fg leading-snug">
					<InlineCode text={section.title} />
				</h4>
				<p className="font-mono text-[11px] text-muted uppercase">
					{STAT_LABELS[section.stat]} · {chartSubtitle(artifacts[0], section)}
				</p>
			</header>
			<div className="flex flex-col gap-3">
				<ColumnChart
					label={`${STAT_LABELS[section.stat]}: ${section.title.replaceAll("`", "")}`}
					unit={section.unit}
					bars={series.map((s) => ({
						id: s.id,
						name: s.name,
						sublabel: s.runtime,
						version: s.version,
						value: totals[s.id],
						highlight: s.ours,
						comparison: barComparison(section, s, baseline, totals),
					}))}
				/>
				<Legend />
			</div>
			<SeriesTable
				unit={section.unit}
				baselineName={baseline.name}
				rows={series.map((s) => ({
					id: s.id,
					name: s.name,
					runtime: s.runtime,
					version: s.version,
					ours: s.ours,
					total: formatValue(totals[s.id], section.unit),
					versus:
						s.id === baseline.id
							? "baseline"
							: versus(section, totals[s.id], totals[baseline.id]),
					...sizeOf(s.id),
				}))}
			/>
			{section.note && (
				<p className="font-sans text-[13px] text-muted leading-relaxed">
					{section.note}
				</p>
			)}
			<FixtureTable section={section} />
			{size && <FixtureTable section={size} heading="Per-fixture sizes" />}
			<div className="flex flex-col gap-1">
				{artifacts.map((artifact) => (
					<RunMeta key={artifact.key} artifact={artifact} />
				))}
			</div>
		</article>
	);
}
