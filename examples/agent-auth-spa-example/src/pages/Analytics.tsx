import { PageHeader } from "../components/PageHeader";

const KPIS = [
	{ label: "Sessions / day", value: "8,402" },
	{ label: "Conversion", value: "3.7%" },
	{ label: "Bounce rate", value: "41.2%" },
];

const HEAT = [
	[8, 12, 18, 22, 30, 28, 14],
	[10, 16, 20, 26, 34, 30, 16],
	[12, 18, 24, 30, 38, 34, 18],
	[14, 22, 28, 36, 44, 38, 22],
	[10, 16, 20, 26, 32, 28, 16],
];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const HOURS = ["08", "12", "16", "20", "00"];

function cellColor(v: number): string {
	if (v >= 40) return "bg-indigo-700";
	if (v >= 30) return "bg-indigo-500";
	if (v >= 20) return "bg-indigo-400";
	if (v >= 12) return "bg-indigo-300";
	return "bg-indigo-200";
}

export default function Analytics() {
	return (
		<>
			<PageHeader title="Analytics" subtitle="Engagement, by day and hour." />
			<section className="grid grid-cols-3 gap-4">
				{KPIS.map((k) => (
					<div
						key={k.label}
						className="rounded-lg border border-slate-200 bg-white p-5"
					>
						<div className="text-sm text-slate-500">{k.label}</div>
						<div className="mt-2 text-2xl font-semibold text-slate-900">
							{k.value}
						</div>
					</div>
				))}
			</section>
			<section className="mt-10 max-w-3xl rounded-lg border border-slate-200 bg-white p-6">
				<h2 className="mb-4 text-sm font-medium text-slate-700">
					Sessions heatmap
				</h2>
				<div className="flex">
					<div className="mr-3 flex flex-col justify-between py-1 text-xs text-slate-400">
						{HOURS.map((h) => (
							<span key={h}>{h}</span>
						))}
					</div>
					<div className="flex-1">
						<div className="grid grid-cols-7 gap-1">
							{HEAT.flatMap((row) =>
								row.map((v) => (
									<div
										key={`${row}-${v}`}
										className={`h-6 rounded-sm ${cellColor(v)}`}
										title={`${v}`}
									/>
								)),
							)}
						</div>
						<div className="mt-2 grid grid-cols-7 text-center text-xs text-slate-400">
							{DAYS.map((d) => (
								<span key={d}>{d}</span>
							))}
						</div>
					</div>
				</div>
			</section>
		</>
	);
}
