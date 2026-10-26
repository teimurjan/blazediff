import { type CardSpec, fasterThan, resolveCards } from "./artifacts";
import BenchmarkSectionCard from "./benchmark-section";

/** Benchmark charts for an MDX page, from the same artifacts as /benchmarks. */
export default function BenchmarkCharts({ cards }: { cards: CardSpec[] }) {
	return (
		<div className="not-prose mt-6 flex flex-col gap-6">
			{cards.flatMap(resolveCards).map((card) => (
				<BenchmarkSectionCard
					key={card.id}
					artifacts={card.artifacts}
					section={card.section}
				/>
			))}
		</div>
	);
}

/** Inline "~4.6x faster" claim read from a committed benchmark artifact. */
export function FasterThan({
	bench,
	section = bench,
	ours,
	theirs,
}: {
	bench: string;
	section?: string;
	ours: string;
	theirs: string;
}) {
	const claim = fasterThan(bench, section, ours, theirs);
	// A comparison page without its number is wrong, so fail the build.
	if (!claim) {
		throw new Error(`No benchmark totals for ${bench}/${section}.`);
	}
	return <>{claim}</>;
}
