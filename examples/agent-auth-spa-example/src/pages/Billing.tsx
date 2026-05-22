import { PageHeader } from "../components/PageHeader";

const INVOICES = [
	{ id: "INV-001", date: "2026-01-15", amount: "$240.00", status: "Paid" },
	{ id: "INV-002", date: "2026-02-15", amount: "$240.00", status: "Paid" },
	{ id: "INV-003", date: "2026-03-15", amount: "$240.00", status: "Paid" },
];

export default function Billing() {
	return (
		<>
			<PageHeader title="Billing" subtitle="$240/month on the Team plan." />
			<section className="max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white">
				<table className="w-full text-sm">
					<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th className="px-5 py-3">Invoice</th>
							<th className="px-5 py-3">Date</th>
							<th className="px-5 py-3">Amount</th>
							<th className="px-5 py-3">Status</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-200">
						{INVOICES.map((inv) => (
							<tr key={inv.id}>
								<td className="px-5 py-3 font-medium text-slate-900">
									{inv.id}
								</td>
								<td className="px-5 py-3 text-slate-600">{inv.date}</td>
								<td className="px-5 py-3 text-slate-900">{inv.amount}</td>
								<td className="px-5 py-3">
									<span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
										{inv.status}
									</span>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</section>
		</>
	);
}
