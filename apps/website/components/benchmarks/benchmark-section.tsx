import {
	type BenchmarkArtifact,
	type BenchmarkSection,
	completeRows,
	sectionTotals,
} from "./artifacts";
import ColumnChart, { type ColumnBar } from "./column-chart";
import FixtureTable from "./fixture-table";
import InlineCode from "./inline-code";

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
			{" · "}
			<code>pnpm benchmark {artifact.key}</code>
		</p>
	);
}

interface Measured {
	name: string;
	value: number;
}

// Time reads as a speedup; size as a share of the other side's bytes.
function versus(section: BenchmarkSection, subject: number, other: Measured) {
	if (section.unit === "bytes") {
		return `${((subject / other.value) * 100).toFixed(1)}% of ${other.name}'s size`;
	}
	const ratio = other.value / subject;
	return ratio >= 1
		? `${ratio.toFixed(2)}x faster than ${other.name}`
		: `${(1 / ratio).toFixed(2)}x slower than ${other.name}`;
}

// BlazeDiff bars compare to the baseline; competitor bars say how BlazeDiff
// does against them.
function chartBars(section: BenchmarkSection): ColumnBar[] {
	const totals = sectionTotals(section);
	const measured = (id: string): Measured => ({
		name: section.series.find((s) => s.id === id)?.name ?? id,
		value: totals[id],
	});
	const base = section.series.find((s) => s.baseline) ?? section.series[0];
	const ours = section.series.find((s) => s.ours);
	return section.series.map((s) => ({
		id: s.id,
		name: s.name,
		version: s.version,
		value: totals[s.id],
		highlight: s.ours,
		comparison: s.ours
			? versus(section, totals[s.id], measured(base.id))
			: ours
				? `${ours.name}: ${versus(section, totals[ours.id], measured(s.id))}`
				: "baseline",
	}));
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

export default function BenchmarkSectionCard({
	artifacts,
	section,
}: {
	/** Every bench the chart draws from; a merged chart has several. */
	artifacts: BenchmarkArtifact[];
	section: BenchmarkSection;
}) {
	return (
		<article className="flex min-w-0 flex-col gap-4 border border-line bg-surface p-6">
			<header className="flex flex-col gap-2">
				<h4 className="font-sans text-[16px] text-fg leading-snug">
					<InlineCode text={section.title} />
				</h4>
				<p className="font-mono text-[11px] text-muted uppercase">
					{STAT_LABELS[section.stat]} · {chartSubtitle(artifacts[0], section)}
				</p>
			</header>
			<ColumnChart
				label={`${STAT_LABELS[section.stat]}: ${section.title.replaceAll("`", "")}`}
				unit={section.unit}
				bars={chartBars(section)}
			/>
			<Legend />
			{section.note && (
				<p className="font-sans text-[13px] text-muted leading-relaxed">
					{section.note}
				</p>
			)}
			{artifacts.map((artifact) => (
				<RunMeta key={artifact.key} artifact={artifact} />
			))}
			<FixtureTable section={section} />
		</article>
	);
}
