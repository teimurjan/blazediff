import Link from "next/link";
import HeroHeading, { HeroAccent } from "../landing/hero-heading";
import HeroSubhead from "../landing/hero-subhead";
import Section from "../landing/section";
import LandingShell from "../landing/shell";
import {
	type CardSpec,
	PLATFORMS,
	type Platform,
	platformLabel,
	resolveCards,
} from "./artifacts";
import BenchmarkSectionCard from "./benchmark-section";
import Contents from "./contents";
import { ordinal } from "./format";

const CATEGORIES: {
	id: string;
	title: string;
	intro: string;
	groups: { id: string; title: string; cards: CardSpec[] }[];
}[] = [
	{
		id: "pixel-by-pixel",
		title: "PIXEL BY PIXEL",
		intro:
			"Direct pixel comparisons in JavaScript, WebAssembly, the native binary and the Python bindings.",
		groups: [
			{ id: "javascript", title: "JavaScript", cards: ["core"] },
			{
				id: "native",
				title: "Native",
				cards: [
					"core-wasm",
					{
						id: "native",
						title:
							"JavaScript Native Binary (`@blazediff/core-native` vs `odiff` vs `honeydiff`) (image IO included)",
						keys: ["core-native", "honeydiff"],
					},
				],
			},
			{
				id: "python",
				title: "Python",
				cards: [
					{
						id: "python",
						title:
							"Python Bindings (`blazediff` vs `pixelmatch` vs `opencv-python`) (image IO included)",
						keys: ["python-pixelmatch", "python-opencv"],
					},
				],
			},
		],
	},
	{
		id: "structural",
		title: "STRUCTURAL",
		intro: "SSIM and its variants against ssim.js and the Rust dssim.",
		groups: [
			{
				id: "javascript",
				title: "JavaScript and native",
				cards: ["ssim", "hitchhikers-ssim"],
			},
			{ id: "rust", title: "Rust", cards: ["ssim-dssim"] },
		],
	},
	{
		id: "object",
		title: "OBJECT",
		intro: "Deep object diffing against microdiff.",
		groups: [{ id: "javascript", title: "JavaScript", cards: ["object"] }],
	},
	{
		id: "png-codec",
		title: "PNG CODEC",
		intro:
			"The blazediff-png codec against spng, image-rs and zune-png in Rust, and against zune-png and jSquash in WebAssembly, decode and encode.",
		groups: [
			{ id: "rust", title: "Rust", cards: ["png"] },
			{ id: "wasm", title: "WebAssembly", cards: ["png-wasm"] },
		],
	},
];

// Benches not yet run on this machine are skipped, and so are empty groups.
function availableCategories(platform: Platform) {
	return CATEGORIES.map((category) => ({
		...category,
		groups: category.groups
			.map((group) => ({
				...group,
				anchor: `${category.id}-${group.id}`,
				cards: group.cards.flatMap((card) => resolveCards(card, platform)),
			}))
			.filter((group) => group.cards.length > 0),
	})).filter((category) => category.groups.length > 0);
}

/** The first platform owns /benchmarks; the others get /benchmarks/<platform>. */
const platformHref = (platform: Platform) =>
	platform === PLATFORMS[0] ? "/benchmarks" : `/benchmarks/${platform}`;

function PlatformTabs({ active }: { active: Platform }) {
	return (
		<nav aria-label="Benchmark machine" className="flex gap-2">
			{PLATFORMS.map((platform) => (
				<Link
					key={platform}
					href={platformHref(platform)}
					aria-current={platform === active ? "page" : undefined}
					className={`border px-4 py-2 font-mono text-[13px] uppercase tracking-wider transition-colors ${
						platform === active
							? "border-accent text-fg"
							: "border-line text-muted hover:text-fg"
					}`}
				>
					{platformLabel(platform)}
				</Link>
			))}
		</nav>
	);
}

export default function BenchmarksView({ platform }: { platform: Platform }) {
	const AVAILABLE = availableCategories(platform);
	return (
		<LandingShell activeTab="benchmarks" ctaLabel="GET STARTED" ctaHref="/docs">
			<section className="w-full max-w-screen-2xl mx-auto px-10 pt-16 pb-12 flex flex-col gap-8">
				<HeroHeading>
					BENCH<HeroAccent>MARKS</HeroAccent>
				</HeroHeading>
				<HeroSubhead>
					Every number on this page comes from{" "}
					<span className="font-mono text-fg">pnpm benchmark &lt;key&gt;</span>{" "}
					and is committed to the repo as JSON in{" "}
					<span className="font-mono text-fg">benchmarks/results</span>, once
					per machine. Each chart names its machine, toolchain and commit, so
					you can reproduce it.
				</HeroSubhead>
				{PLATFORMS.length > 1 && <PlatformTabs active={platform} />}
			</section>

			{AVAILABLE.length === 0 ? (
				<Section>
					<p className="font-sans text-[15px] text-muted">
						No benchmark results yet. Run{" "}
						<span className="font-mono text-fg">
							pnpm benchmark &lt;key&gt;
						</span>{" "}
						to create them in{" "}
						<span className="font-mono text-fg">benchmarks/results</span>.
					</p>
				</Section>
			) : (
				<div className="w-full max-w-screen-2xl mx-auto px-10 pb-20 grid gap-12 lg:grid-cols-[minmax(0,1fr)_220px]">
					<div className="flex min-w-0 flex-col gap-20">
						{AVAILABLE.map((category, i) => (
							<section
								key={category.id}
								id={category.id}
								className="flex scroll-mt-24 flex-col gap-10 border-t border-line pt-10"
							>
								<header className="flex flex-col gap-3">
									<div className="flex items-baseline gap-4">
										<span className="font-mono text-[14px] text-accent">
											{ordinal(i)}
										</span>
										<h2 className="font-display text-[24px] text-fg uppercase tracking-tight">
											{category.title}
										</h2>
									</div>
									<p className="max-w-2xl font-sans text-[15px] text-muted leading-relaxed">
										{category.intro}
									</p>
								</header>
								{category.groups.map((group) => (
									<div
										key={group.anchor}
										id={group.anchor}
										className="flex scroll-mt-24 flex-col gap-4"
									>
										<h3 className="flex items-center gap-3 font-mono text-[13px] text-muted uppercase tracking-wider">
											<span className="text-fg">{group.title}</span>
											<span className="h-px flex-1 bg-line" />
											<span>
												{group.cards.length}{" "}
												{group.cards.length === 1 ? "chart" : "charts"}
											</span>
										</h3>
										<div className="grid grid-cols-1 gap-6 md:grid-cols-2">
											{group.cards.map((card) => (
												<BenchmarkSectionCard
													key={card.id}
													artifacts={card.artifacts}
													section={card.section}
												/>
											))}
										</div>
									</div>
								))}
							</section>
						))}
					</div>
					<aside className="hidden lg:block">
						<div className="sticky top-24">
							<Contents
								categories={AVAILABLE.map(({ id, title, groups }) => ({
									id,
									title,
									groups: groups.map(({ anchor, title }) => ({
										anchor,
										title,
									})),
								}))}
							/>
						</div>
					</aside>
				</div>
			)}
		</LandingShell>
	);
}
