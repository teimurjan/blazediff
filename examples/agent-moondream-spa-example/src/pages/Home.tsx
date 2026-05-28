import { PageHeader } from "../components/PageHeader";

const FEATURES = [
	{
		title: "Object storage",
		body: "Durable buckets with versioning and lifecycle rules. Eleven nines, no surprises.",
	},
	{
		title: "Edge cache",
		body: "Pull objects from the nearest of 38 regions. Invalidate globally in under a second.",
	},
	{
		title: "Signed URLs",
		body: "Time-boxed, scope-limited links. Share a file without sharing the bucket.",
	},
];

export default function Home() {
	return (
		<>
			<PageHeader
				eyebrow="Cloud storage"
				title="Files that load fast, everywhere."
				subtitle="Nimbus is a fictional object store built as a deterministic visual-regression target for the BlazeDiff agent's local Moondream judge."
			/>
			<section className="grid grid-cols-3 gap-6">
				{FEATURES.map((f) => (
					<article
						key={f.title}
						className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-6"
					>
						<h2 className="text-lg font-semibold text-indigo-950">{f.title}</h2>
						<p className="mt-2 text-sm text-indigo-900/70">{f.body}</p>
					</article>
				))}
			</section>
			<section className="mt-10 flex items-center justify-between rounded-xl bg-indigo-600 px-8 py-7">
				<div>
					<div className="text-lg font-semibold text-white">
						Start with 10 GB free
					</div>
					<p className="mt-1 text-sm text-indigo-100">
						No card required. Deterministic by design.
					</p>
				</div>
				<span className="rounded-md bg-white px-5 py-2 text-sm font-medium text-indigo-700">
					Create a bucket
				</span>
			</section>
		</>
	);
}
