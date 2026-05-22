import { PageHeader } from "../components/PageHeader";

const FEATURES = [
	{
		title: "Deterministic",
		body: "Stable selectors, no animations, no random data. Baselines stay byte-stable.",
	},
	{
		title: "Auth-aware",
		body: "Eight routes behind a localStorage gate exercise the harness end-to-end.",
	},
	{
		title: "Minimal",
		body: "Vite + React, 12 page components, zero network calls. Boots in under a second.",
	},
];

export default function Home() {
	return (
		<>
			<PageHeader
				title="Acme Suite"
				subtitle="The official BlazeDiff agent auth-flow test target."
			/>
			<section className="grid grid-cols-3 gap-6">
				{FEATURES.map((f) => (
					<article
						key={f.title}
						className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
					>
						<h2 className="text-lg font-semibold text-slate-900">{f.title}</h2>
						<p className="mt-2 text-sm text-slate-600">{f.body}</p>
					</article>
				))}
			</section>
		</>
	);
}
