import {
	type BenchmarkSection,
	type BenchmarkSeries,
	sectionTotals,
} from "./artifacts";
import { type BenchmarkUnit, formatValue } from "./format";

// Time reads as a speedup over the baseline; size as a share of its bytes.
function versus(base: number, other: number, unit: BenchmarkUnit) {
	return unit === "bytes"
		? `${((other / base) * 100).toFixed(1)}%`
		: `${(base / other).toFixed(2)}x`;
}

const label = (s: BenchmarkSeries) =>
	s.runtime ? `${s.name} (${s.runtime})` : s.name;

function Cell({
	value,
	unit,
	ours,
}: {
	value: number | undefined;
	unit: BenchmarkUnit;
	ours: boolean;
}) {
	return (
		<td
			className={`px-4 py-2 text-right whitespace-nowrap ${ours ? "bg-accent/10" : ""}`}
		>
			{value === undefined ? "-" : formatValue(value, unit)}
		</td>
	);
}

export default function FixtureTable({
	section,
	heading = "Per-fixture results",
}: {
	section: BenchmarkSection;
	heading?: string;
}) {
	const baseline = section.series.find((s) => s.baseline) ?? section.series[0];
	// Ratio columns only for BlazeDiff, so a wide chart stays readable.
	const others = section.series.filter((s) => s.ours && s.id !== baseline.id);
	const hasMpx = section.rows.some((row) => row.mpx !== undefined);
	const totals = sectionTotals(section);

	return (
		<details className="border border-line">
			<summary className="cursor-pointer px-4 py-3 font-mono text-[12px] uppercase text-muted hover:text-fg">
				{heading} ({section.rows.length})
			</summary>
			<div className="overflow-x-auto border-t border-line">
				<table className="w-full font-mono text-[12px] text-fg">
					<thead className="text-muted uppercase">
						<tr className="border-b border-line">
							<th className="px-4 py-2 text-left">Fixture</th>
							{hasMpx && <th className="px-4 py-2 text-right">MPx</th>}
							{section.series.map((s) => (
								<th
									key={s.id}
									className={`px-4 py-2 text-right ${s.ours ? "text-accent" : ""}`}
								>
									{label(s)}
								</th>
							))}
							{others.map((s) => (
								<th key={s.id} className="px-4 py-2 text-right">
									{label(s)} vs {label(baseline)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{section.rows.map((row) => {
							const base = row.values[baseline.id]?.value;
							return (
								<tr key={row.fixture} className="border-b border-line/50">
									<td className="px-4 py-2 text-left whitespace-nowrap">
										{row.fixture}
									</td>
									{hasMpx && (
										<td className="px-4 py-2 text-right">
											{row.mpx?.toFixed(1)}
										</td>
									)}
									{section.series.map((s) => (
										<Cell
											key={s.id}
											value={row.values[s.id]?.value}
											unit={section.unit}
											ours={s.ours}
										/>
									))}
									{others.map((s) => {
										const other = row.values[s.id]?.value;
										return (
											<td
												key={s.id}
												className="px-4 py-2 text-right text-accent"
											>
												{base === undefined || other === undefined
													? "-"
													: versus(base, other, section.unit)}
											</td>
										);
									})}
								</tr>
							);
						})}
					</tbody>
					<tfoot className="font-semibold">
						<tr>
							<td className="px-4 py-2 text-left">TOTAL</td>
							{hasMpx && <td />}
							{section.series.map((s) => (
								<Cell
									key={s.id}
									value={totals[s.id]}
									unit={section.unit}
									ours={s.ours}
								/>
							))}
							{others.map((s) => (
								<td key={s.id} className="px-4 py-2 text-right text-accent">
									{versus(totals[baseline.id], totals[s.id], section.unit)}
								</td>
							))}
						</tr>
					</tfoot>
				</table>
			</div>
		</details>
	);
}
