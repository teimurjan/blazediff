import type { BenchmarkUnit } from "./format";

export interface SeriesRow {
	id: string;
	name: string;
	runtime?: string;
	version?: string;
	ours: boolean;
	total: string;
	versus: string;
	size?: string;
	sizeVersus?: string;
}

/** One row per library, fastest first, with the BlazeDiff rows highlighted. */
export default function SeriesTable({
	unit,
	baselineName,
	rows,
}: {
	unit: BenchmarkUnit;
	baselineName: string;
	rows: SeriesRow[];
}) {
	const hasRuntime = rows.some((row) => row.runtime);
	const hasVersion = rows.some((row) => row.version);
	const hasSize = rows.some((row) => row.size);
	return (
		<div className="overflow-x-auto border border-line">
			<table className="w-full font-mono text-[13px] text-fg">
				<thead className="text-[11px] text-muted uppercase">
					<tr className="border-b border-line">
						<th className="w-10 px-4 py-2 text-left">#</th>
						<th className="px-4 py-2 text-left">Library</th>
						{hasRuntime && <th className="px-4 py-2 text-left">Runtime</th>}
						{hasVersion && <th className="px-4 py-2 text-left">Version</th>}
						<th className="px-4 py-2 text-right">
							{unit === "bytes" ? "Total size" : "Total time"}
						</th>
						<th className="px-4 py-2 text-right">
							{unit === "bytes" ? "Share of" : "vs"} {baselineName}
						</th>
						{hasSize && (
							<>
								<th className="px-4 py-2 text-right">Output size</th>
								<th className="px-4 py-2 text-right">
									Share of {baselineName}
								</th>
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{rows.map((row, i) => (
						<tr
							key={row.id}
							className={`border-b border-line/50 last:border-b-0 ${
								row.ours ? "bg-accent/10" : ""
							}`}
						>
							<td
								className={`border-l-2 px-4 py-2 text-muted tabular-nums ${
									row.ours ? "border-accent" : "border-transparent"
								}`}
							>
								{i + 1}
							</td>
							<td
								className={`px-4 py-2 whitespace-nowrap ${
									row.ours ? "font-semibold text-accent" : ""
								}`}
							>
								{row.name}
							</td>
							{hasRuntime && (
								<td className="px-4 py-2 whitespace-nowrap text-muted">
									{row.runtime ?? "-"}
								</td>
							)}
							{hasVersion && (
								<td className="px-4 py-2 whitespace-nowrap text-muted">
									{row.version ?? "-"}
								</td>
							)}
							<td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
								{row.total}
							</td>
							<td
								className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${
									row.ours ? "text-accent" : "text-muted"
								}`}
							>
								{row.versus}
							</td>
							{hasSize && (
								<>
									<td className="px-4 py-2 text-right whitespace-nowrap tabular-nums">
										{row.size ?? "-"}
									</td>
									<td
										className={`px-4 py-2 text-right whitespace-nowrap tabular-nums ${
											row.ours ? "text-accent" : "text-muted"
										}`}
									>
										{row.sizeVersus ?? "-"}
									</td>
								</>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
