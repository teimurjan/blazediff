import { PageHeader } from "../components/PageHeader";

const PROJECTS = [
	{
		name: "Onboarding Refresh",
		owner: "Ada",
		status: "In progress",
		tone: "amber",
	},
	{ name: "Pricing v3", owner: "Grace", status: "Shipped", tone: "emerald" },
	{ name: "Auth Hardening", owner: "Alan", status: "In review", tone: "sky" },
	{
		name: "Search Relevance",
		owner: "Edsger",
		status: "Planned",
		tone: "slate",
	},
] as const;

const TONE: Record<(typeof PROJECTS)[number]["tone"], string> = {
	amber: "bg-amber-50 text-amber-700",
	emerald: "bg-emerald-50 text-emerald-700",
	sky: "bg-sky-50 text-sky-700",
	slate: "bg-slate-100 text-slate-700",
};

export default function Projects() {
	return (
		<>
			<PageHeader title="Projects" subtitle="What's in flight this quarter." />
			<section className="grid grid-cols-2 gap-5">
				{PROJECTS.map((p) => (
					<article
						key={p.name}
						className="rounded-lg border border-slate-200 bg-white p-6"
					>
						<div className="flex items-center justify-between">
							<h2 className="text-base font-semibold text-slate-900">
								{p.name}
							</h2>
							<span
								className={`rounded-full px-2 py-1 text-xs font-medium ${TONE[p.tone]}`}
							>
								{p.status}
							</span>
						</div>
						<div className="mt-3 text-sm text-slate-500">
							Owner: <span className="text-slate-700">{p.owner}</span>
						</div>
					</article>
				))}
			</section>
		</>
	);
}
