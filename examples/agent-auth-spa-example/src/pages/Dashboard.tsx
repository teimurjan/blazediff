import { PageHeader } from "../components/PageHeader";

const STATS = [
	{ label: "Active users", value: "1,284", delta: "+4.2%" },
	{ label: "Revenue", value: "$48,210", delta: "+1.1%" },
	{ label: "Errors", value: "37", delta: "-12.4%" },
	{ label: "Latency p95", value: "184ms", delta: "+0.3%" },
];

const ACTIVITY = [
	{ who: "Ada", what: "deployed pricing/v3", when: "10:42" },
	{ who: "Grace", what: "merged refactor-onboarding", when: "10:31" },
	{ who: "Alan", what: "opened issue #2103", when: "10:14" },
	{ who: "Margaret", what: "rolled back checkout/v8", when: "09:55" },
];

export default function Dashboard() {
	return (
		<>
			<PageHeader title="Dashboard" subtitle="An at-a-glance view." />
			<section className="grid grid-cols-4 gap-4">
				{STATS.map((s) => (
					<div
						key={s.label}
						className="rounded-lg border border-slate-200 bg-white p-5"
					>
						<div className="text-sm text-slate-500">{s.label}</div>
						<div className="mt-2 text-2xl font-semibold text-slate-900">
							{s.value}
						</div>
						<div className="mt-1 text-xs text-slate-500">{s.delta}</div>
					</div>
				))}
			</section>
			<section className="mt-10">
				<h2 className="mb-3 text-lg font-semibold text-slate-900">
					Recent activity
				</h2>
				<ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
					{ACTIVITY.map((a) => (
						<li
							key={`${a.who}-${a.when}`}
							className="flex items-center justify-between px-4 py-3 text-sm"
						>
							<span>
								<span className="font-medium text-slate-900">{a.who}</span>{" "}
								<span className="text-slate-600">{a.what}</span>
							</span>
							<span className="text-slate-400">{a.when}</span>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
