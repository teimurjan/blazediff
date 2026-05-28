import { PageHeader } from "../components/PageHeader";

const TIERS = [
	{
		name: "Hobby",
		price: "$0",
		blurb: "For side projects.",
		features: [
			"10 GB storage",
			"50 GB egress",
			"1 region",
			"Community support",
		],
		featured: false,
	},
	{
		name: "Team",
		price: "$29",
		blurb: "For growing apps.",
		features: ["1 TB storage", "5 TB egress", "12 regions", "Email support"],
		featured: true,
	},
	{
		name: "Scale",
		price: "$99",
		blurb: "For production.",
		features: [
			"10 TB storage",
			"Unlimited egress",
			"38 regions",
			"Priority SLA",
		],
		featured: false,
	},
];

export default function Pricing() {
	return (
		<>
			<PageHeader
				eyebrow="Pricing"
				title="Pay for what you store."
				subtitle="Three tiers, no per-seat fees, no metered read tax. Cancel any time."
			/>
			<section className="grid grid-cols-3 gap-6">
				{TIERS.map((t) => (
					<article
						key={t.name}
						className={[
							"rounded-xl border p-6",
							t.featured
								? "border-indigo-600 bg-indigo-600 text-white"
								: "border-indigo-100 bg-white text-indigo-950",
						].join(" ")}
					>
						<div className="text-sm font-semibold uppercase tracking-wide">
							{t.name}
						</div>
						<div className="mt-3 flex items-baseline gap-1">
							<span className="text-3xl font-semibold">{t.price}</span>
							<span
								className={
									t.featured ? "text-indigo-200" : "text-indigo-900/50"
								}
							>
								/mo
							</span>
						</div>
						<p
							className={[
								"mt-1 text-sm",
								t.featured ? "text-indigo-100" : "text-indigo-900/60",
							].join(" ")}
						>
							{t.blurb}
						</p>
						<ul className="mt-5 space-y-2 text-sm">
							{t.features.map((f) => (
								<li key={f} className="flex items-center gap-2">
									<span
										className={[
											"inline-block h-1.5 w-1.5 rounded-full",
											t.featured ? "bg-indigo-200" : "bg-indigo-400",
										].join(" ")}
									/>
									{f}
								</li>
							))}
						</ul>
					</article>
				))}
			</section>
		</>
	);
}
