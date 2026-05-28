import { PageHeader } from "../components/PageHeader";

const SERVICES = [
	{ name: "Object API", state: "Operational", uptime: "99.99%" },
	{ name: "Edge cache", state: "Operational", uptime: "99.98%" },
	{ name: "Dashboard", state: "Operational", uptime: "99.95%" },
	{ name: "Signed URLs", state: "Degraded", uptime: "99.40%" },
	{ name: "Webhooks", state: "Operational", uptime: "99.97%" },
];

function dotClass(state: string): string {
	return state === "Operational" ? "bg-emerald-500" : "bg-amber-500";
}

export default function Status() {
	return (
		<>
			<PageHeader
				eyebrow="Status"
				title="System status"
				subtitle="A snapshot board — every value is hard-coded for byte-stable baselines."
			/>
			<div className="overflow-hidden rounded-xl border border-indigo-100">
				{SERVICES.map((s, i) => (
					<div
						key={s.name}
						className={[
							"flex items-center justify-between px-6 py-4",
							i > 0 ? "border-t border-indigo-100" : "",
						].join(" ")}
					>
						<div className="flex items-center gap-3">
							<span
								className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass(s.state)}`}
							/>
							<span className="font-medium text-indigo-950">{s.name}</span>
						</div>
						<div className="flex items-center gap-8 text-sm">
							<span className="text-indigo-900/60">{s.state}</span>
							<span className="font-mono text-indigo-900/50">{s.uptime}</span>
						</div>
					</div>
				))}
			</div>
		</>
	);
}
