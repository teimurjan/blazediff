import { PageHeader } from "../components/PageHeader";

const REPORTS = [
	{ name: "Weekly engagement", owner: "Marketing", rows: 1200, format: "CSV" },
	{ name: "Funnel breakdown", owner: "Growth", rows: 340, format: "PDF" },
	{ name: "API latency", owner: "Platform", rows: 720, format: "JSON" },
	{ name: "Churn by cohort", owner: "Success", rows: 96, format: "CSV" },
	{ name: "Feature adoption", owner: "Product", rows: 512, format: "JSON" },
];

export default function Reports() {
	return (
		<>
			<PageHeader title="Reports" subtitle="Saved queries you can export." />
			<section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
				<table className="w-full text-sm">
					<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th className="px-5 py-3">Report</th>
							<th className="px-5 py-3">Owner</th>
							<th className="px-5 py-3">Rows</th>
							<th className="px-5 py-3">Format</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200">
						{REPORTS.map((r) => (
							<tr key={r.name}>
								<td className="px-5 py-3 font-medium text-slate-900">
									{r.name}
								</td>
								<td className="px-5 py-3 text-slate-600">{r.owner}</td>
								<td className="px-5 py-3 text-slate-900">{r.rows}</td>
								<td className="px-5 py-3 text-slate-600">{r.format}</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</>
	);
}
