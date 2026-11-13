import Link from "next/link";
import HeroHeading, { HeroAccent } from "../landing/hero-heading";
import HeroSubhead from "../landing/hero-subhead";
import Section from "../landing/section";
import LandingShell from "../landing/shell";
import {
	type ChartSpec,
	PLATFORMS,
	type Platform,
	platformLabel,
	resolveChart,
} from "./artifacts";
import BenchmarkSectionCard from "./benchmark-section";
import Contents from "./contents";
import { ordinal } from "./format";

// Rust and wasm series of one PNG measure; encodes carry their output size.
const png = (
	sections: { rust: string; wasm: string },
	series: { rust: string[]; wasm: string[] },
	runtimes: { rust: string; wasm: string },
) =>
	(["rust", "wasm"] as const).flatMap((side) =>
		series[side].map((id) => ({
			key: side === "rust" ? "png" : "png-wasm",
			section: sections[side],
			sizeSection: sections[side].startsWith("encode-")
				? sections[side].replace("encode-", "size-")
				: undefined,
			series: id,
			runtime: runtimes[side],
		})),
	);

const PNG_RUST = ["spng", "blazediff", "image-rs", "zune"];
const PNG_WASM = ["blazediff", "zune", "jsquash"];

const CATEGORIES: {
	id: string;
	title: string;
	intro: string;
	charts: ChartSpec[];
}[] = [
	{
		id: "pixel-by-pixel",
		title: "PIXEL BY PIXEL",
		intro:
			"Direct pixel comparisons in JavaScript, WebAssembly, the native binary and the Python bindings.",
		charts: [
			{
				id: "io-excluded",
				title: "Image IO excluded (pre-decoded RGBA buffers)",
				picks: [
					{ key: "core", series: "pixelmatch", runtime: "JS, count only" },
					{ key: "core", series: "blazediff", runtime: "core, count only" },
					{
						key: "core-wasm",
						series: "blazediff-core-wasm",
						runtime: "core-wasm, count only",
					},
					{
						key: "core",
						section: "core-output",
						series: "pixelmatch",
						runtime: "JS, with output",
					},
					{
						key: "core",
						section: "core-output",
						series: "blazediff",
						runtime: "core, with output",
					},
				],
			},
			{
				id: "io-included",
				title: "Image IO included (PNG files in, diff PNG out)",
				note: "Own PNG means BLAZEDIFF_PNG_ENABLED=1, which decodes with blazediff-png instead of spng. The Python bindings run the same Rust core as core-native.",
				picks: [
					{ key: "core-native", series: "odiff", runtime: "native" },
					{ key: "honeydiff", series: "honeydiff", runtime: "native" },
					{ key: "core-native", series: "blazediff", runtime: "core-native" },
					{
						key: "core-native",
						series: "blazediff-next",
						name: "BlazeDiff",
						runtime: "core-native, own PNG",
					},
					{
						key: "python-pixelmatch",
						series: "pixelmatch-pypi",
						name: "pixelmatch",
						runtime: "Python (pypi)",
					},
					{
						key: "python-opencv",
						series: "opencv-absdiff",
						runtime: "Python",
					},
					{
						key: "python-pixelmatch",
						series: "blazediff",
						runtime: "Python",
					},
				],
			},
		],
	},
	{
		id: "structural",
		title: "STRUCTURAL",
		intro:
			"SSIM and its variants against ssim.js and the Rust dssim. The dssim run uses its own fixtures and best-of timing, so it has its own chart.",
		charts: [
			{
				id: "ssim",
				title: "SSIM in JavaScript and native (image IO excluded)",
				picks: [
					{ key: "ssim", series: "ssim-js", runtime: "JS, fast" },
					{ key: "ssim", series: "blazediff", runtime: "JS, SSIM" },
					{
						key: "ssim",
						series: "blazediff-ssim-native",
						name: "BlazeDiff",
						runtime: "native, SSIM",
					},
					{
						key: "hitchhikers-ssim",
						series: "ssim-js",
						runtime: "JS, weber",
					},
					{
						key: "hitchhikers-ssim",
						series: "blazediff",
						runtime: "JS, Hitchhiker's",
					},
					{
						key: "hitchhikers-ssim",
						series: "blazediff-ssim-native",
						name: "BlazeDiff",
						runtime: "native, Hitchhiker's",
					},
				],
			},
			{
				id: "rust",
				title: "Rust against dssim (image IO excluded)",
				picks: [
					{ key: "ssim-dssim", series: "dssim", runtime: "Rust" },
					...["ssim", "ms-ssim", "hitchhikers"].map((id) => ({
						key: "ssim-dssim",
						series: id,
						name: "BlazeDiff",
						runtime: `Rust, ${id}`,
					})),
				],
			},
		],
	},
	{
		id: "object",
		title: "OBJECT",
		intro: "Deep object diffing against microdiff.",
		charts: [
			{
				id: "javascript",
				title: "Object diff in JavaScript",
				picks: [
					{ key: "object", series: "microdiff" },
					{ key: "object", series: "blazediff" },
				],
			},
		],
	},
	{
		id: "png-codec",
		title: "PNG CODEC",
		intro:
			"The blazediff-png codec against spng, image-rs and zune-png in Rust, and against zune-png and jSquash in WebAssembly, single-threaded. Each encode table also shows the size of the files it wrote.",
		charts: [
			{
				id: "decode",
				title: "Decode (PNG to RGBA8)",
				picks: png(
					{ rust: "decode", wasm: "decode" },
					{ rust: PNG_RUST, wasm: PNG_WASM },
					{ rust: "Rust", wasm: "wasm" },
				),
			},
			{
				id: "encode-none",
				title: "Encode, no compression",
				picks: png(
					{ rust: "encode-none", wasm: "encode-none" },
					{ rust: PNG_RUST, wasm: ["blazediff", "zune"] },
					{ rust: "Rust", wasm: "wasm" },
				),
			},
			{
				id: "encode-compressed",
				title: "Encode, compressed",
				picks: png(
					{ rust: "encode-half", wasm: "encode-default" },
					{ rust: PNG_RUST, wasm: PNG_WASM },
					{ rust: "Rust, half", wasm: "wasm, default" },
				),
			},
		],
	},
];

// Benches not yet run on this machine are skipped, and so are empty categories.
function availableCategories(platform: Platform) {
	return CATEGORIES.map((category) => ({
		...category,
		cards: category.charts.flatMap((chart) => {
			const card = resolveChart(chart, platform);
			return card ? [{ ...card, anchor: `${category.id}-${chart.id}` }] : [];
		}),
	})).filter((category) => category.cards.length > 0);
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
								{category.cards.map((card) => (
									<div
										key={card.anchor}
										id={card.anchor}
										className="scroll-mt-24"
									>
										<BenchmarkSectionCard
											artifacts={card.artifacts}
											section={card.section}
											size={card.size}
										/>
									</div>
								))}
							</section>
						))}
					</div>
					<aside className="hidden lg:block">
						<div className="sticky top-24">
							<Contents
								categories={AVAILABLE.map(({ id, title, cards }) => ({
									id,
									title,
									groups: cards.map(({ anchor, section }) => ({
										anchor,
										title: section.title.replace(/ \(.*\)$/, ""),
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
