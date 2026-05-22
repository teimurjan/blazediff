import { PageHeader } from "../components/PageHeader";

const TOGGLES = [
	{
		label: "Email notifications",
		on: true,
		note: "Send a summary every Friday.",
	},
	{ label: "Two-factor auth", on: true, note: "Required for admin accounts." },
	{
		label: "Beta features",
		on: false,
		note: "Opt in to experimental UI changes.",
	},
	{ label: "Telemetry", on: false, note: "Share anonymized usage analytics." },
];

function Toggle({ on }: { on: boolean }) {
	return (
		<span
			className={`inline-flex h-5 w-9 items-center rounded-full ${
				on ? "bg-emerald-500" : "bg-slate-300"
			}`}
		>
			<span
				className={`inline-block h-4 w-4 rounded-full bg-white shadow ${
					on ? "translate-x-4" : "translate-x-1"
				}`}
			/>
		</span>
	);
}

export default function Settings() {
	return (
		<>
			<PageHeader title="Settings" subtitle="Preferences for this workspace." />
			<section className="max-w-2xl divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
				{TOGGLES.map((t) => (
					<div
						key={t.label}
						className="flex items-center justify-between px-5 py-4"
					>
						<div>
							<div className="text-sm font-medium text-slate-900">
								{t.label}
							</div>
							<div className="text-xs text-slate-500">{t.note}</div>
						</div>
						<Toggle on={t.on} />
					</div>
				))}
			</section>
		</>
	);
}
