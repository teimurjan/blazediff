import { PageHeader } from "../components/PageHeader";

const RELEASES = [
	{
		version: "v2.4.0",
		date: "Jan 2025",
		notes: [
			"Added lifecycle rules for automatic tiering to cold storage.",
			"Signed URLs now support response-content-disposition overrides.",
		],
	},
	{
		version: "v2.3.1",
		date: "Dec 2024",
		notes: [
			"Fixed a rare 1-byte range-read off-by-one on multipart objects.",
			"Reduced cold-start latency in the Frankfurt region.",
		],
	},
	{
		version: "v2.3.0",
		date: "Nov 2024",
		notes: [
			"Introduced bucket-level versioning with soft delete.",
			"New regions: São Paulo and Mumbai.",
		],
	},
];

export default function Changelog() {
	return (
		<>
			<PageHeader
				eyebrow="Changelog"
				title="What's new"
				subtitle="A fixed, deterministic history — no live dates, no flicker."
			/>
			<ol className="space-y-8 border-l border-indigo-100 pl-6">
				{RELEASES.map((r) => (
					<li key={r.version} className="relative">
						<span className="absolute -left-[1.6rem] top-1.5 h-3 w-3 rounded-full border-2 border-white bg-indigo-600" />
						<div className="flex items-center gap-3">
							<span className="font-mono text-sm font-semibold text-indigo-700">
								{r.version}
							</span>
							<span className="text-xs uppercase tracking-wide text-indigo-900/40">
								{r.date}
							</span>
						</div>
						<ul className="mt-2 space-y-1 text-sm text-indigo-900/75">
							{r.notes.map((n) => (
								<li key={n}>{n}</li>
							))}
						</ul>
					</li>
				))}
			</ol>
		</>
	);
}
