import { PageHeader } from "../components/PageHeader";

const MEMBERS = [
	{ name: "Ada Lovelace", role: "Founder", initials: "AL" },
	{ name: "Grace Hopper", role: "VP Engineering", initials: "GH" },
	{ name: "Alan Turing", role: "Head of Research", initials: "AT" },
	{ name: "Edsger Dijkstra", role: "Principal Engineer", initials: "ED" },
	{
		name: "Margaret Hamilton",
		role: "Director of Reliability",
		initials: "MH",
	},
];

export default function Team() {
	return (
		<>
			<PageHeader title="Team" subtitle="Five people, zero pager rotations." />
			<section className="grid grid-cols-3 gap-4">
				{MEMBERS.map((m) => (
					<article
						key={m.name}
						className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-5"
					>
						<div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-sm font-medium text-white">
							{m.initials}
						</div>
						<div>
							<div className="font-medium text-slate-900">{m.name}</div>
							<div className="text-sm text-slate-500">{m.role}</div>
						</div>
					</article>
				))}
			</section>
		</>
	);
}
