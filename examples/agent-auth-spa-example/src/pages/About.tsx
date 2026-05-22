import { PageHeader } from "../components/PageHeader";

const TEAM = [
	{ name: "Ada Lovelace", role: "Founder" },
	{ name: "Grace Hopper", role: "VP Engineering" },
	{ name: "Alan Turing", role: "Head of Research" },
	{ name: "Edsger Dijkstra", role: "Principal Engineer" },
	{ name: "Margaret Hamilton", role: "Director of Reliability" },
];

export default function About() {
	return (
		<>
			<PageHeader
				title="About Acme"
				subtitle="A fictional company with very stable employees."
			/>
			<section className="max-w-2xl space-y-4 text-slate-700">
				<p>
					Acme Suite is a fictional product built to give the BlazeDiff agent
					something to look at. The pages are intentionally simple so the
					screenshots stay byte-stable across machines and CI runners.
				</p>
				<p>
					Nothing here calls the network, no images load from third parties, no
					timestamps render, and no animations move. If a baseline ever drifts,
					that's a bug — not a flake.
				</p>
			</section>
			<section className="mt-10">
				<h2 className="mb-4 text-lg font-semibold text-slate-900">Team</h2>
				<ul className="grid grid-cols-2 gap-3 text-sm">
					{TEAM.map((m) => (
						<li
							key={m.name}
							className="rounded-md border border-slate-200 bg-white p-4"
						>
							<div className="font-medium text-slate-900">{m.name}</div>
							<div className="text-slate-500">{m.role}</div>
						</li>
					))}
				</ul>
			</section>
		</>
	);
}
