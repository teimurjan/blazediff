import Link from "next/link";
import BenchmarkChart from "../components/landing/benchmark-chart";
import CtaLink from "../components/landing/cta-link";
import Hero from "../components/landing/hero";
import HeroHeading, { HeroAccent } from "../components/landing/hero-heading";
import HeroInterpret from "../components/landing/hero-interpret";
import HeroSubhead from "../components/landing/hero-subhead";
import InstallSnippet from "../components/landing/install-snippet";
import NumberedCard from "../components/landing/numbered-card";
import Reveal from "../components/landing/reveal";
import Section from "../components/landing/section";
import LandingShell from "../components/landing/shell";
import interpretData from "../data/interpret/blazediff-3-diff.json";

const FIXTURE_A =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3a.png";
const FIXTURE_B =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3b.png";

type Tier = "foundation" | "metrics" | "harness" | "surfaces";

const TIER_LABELS: Record<Tier, string> = {
	foundation: "FOUNDATION",
	metrics: "METRICS",
	harness: "TEST HARNESSES",
	surfaces: "SURFACES",
};

const PACKAGES: {
	name: string;
	href: string;
	blurb: string;
	tier: Tier;
}[] = [
	{
		name: "@blazediff/core",
		href: "/apis/core",
		blurb:
			"Pure-JS pixel diff with two-pass block optimization. ~1.5x faster than pixelmatch with identical accuracy.",
		tier: "foundation",
	},
	{
		name: "@blazediff/core-native",
		href: "/apis/core-native",
		blurb:
			"SIMD-accelerated Rust binary. 3 to 4x faster than odiff, up to 8x faster than pixelmatch on 4K.",
		tier: "foundation",
	},
	{
		name: "@blazediff/core-wasm",
		href: "/apis/core-wasm",
		blurb:
			"Same Rust algorithm, wasm32 v128 SIMD. ~5x faster than pixelmatch on 4K. Browser, edge, any wasm host.",
		tier: "foundation",
	},
	{
		name: "@blazediff/ssim",
		href: "/apis/ssim",
		blurb:
			"SSIM (Structural Similarity Index) for CI visual testing. ~25% faster than ssim.js; Hitchhiker variant ~70% faster.",
		tier: "metrics",
	},
	{
		name: "@blazediff/gmsd",
		href: "/apis/gmsd",
		blurb:
			"GMSD (Gradient Magnitude Similarity Deviation) metric for CI visual testing. Single-threaded, allocation-free hot path.",
		tier: "metrics",
	},
	{
		name: "@blazediff/object",
		href: "/apis/object",
		blurb:
			"Object comparison with path tracking, cycle detection, and CREATE/REMOVE/CHANGE types. ~55% faster than microdiff.",
		tier: "metrics",
	},
	{
		name: "@blazediff/jest",
		href: "/apis/jest",
		blurb: "Jest matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/vitest",
		href: "/apis/vitest",
		blurb: "Vitest matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/bun",
		href: "/apis/bun",
		blurb: "Bun test matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/matcher",
		href: "/apis/matcher",
		blurb: "Core matcher logic for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/agent",
		href: "/agent",
		blurb:
			"Visual regression that your coding agent runs. Onboards Claude Code, Cursor, Codex. No API key required.",
		tier: "surfaces",
	},
	{
		name: "@blazediff/cli",
		href: "/apis/cli",
		blurb: "Command-line interface for image comparison.",
		tier: "surfaces",
	},
	{
		name: "@blazediff/ui",
		href: "/apis/ui",
		blurb: "Headless engine and unstyled renderers for image-diff UIs.",
		tier: "surfaces",
	},
	{
		name: "@blazediff/react",
		href: "/apis/react",
		blurb: "React components for image comparison.",
		tier: "surfaces",
	},
];

const TIER_ORDER: Tier[] = ["surfaces", "harness", "metrics", "foundation"];

const USED_BY = [
	{
		name: "Vitest",
		logo: "/vitest-logo.png",
		href: "https://github.com/vitest-dev/vitest",
	},
	{
		name: "Shopify",
		logo: "/shopify-logo.png",
		href: "https://github.com/Shopify/react-native-skia",
	},
	{
		name: "Ant Design",
		logo: "/antdesign-logo.png",
		href: "https://github.com/ant-design/ant-design",
	},
	{
		name: "Ant Vis G",
		logo: "/antv-logo.png",
		href: "https://github.com/antvis/G",
	},
	{
		name: "Ant Design X",
		logo: "/antx-logo.png",
		href: "https://github.com/ant-design/x",
	},
	{
		name: "GPT-Vis",
		logo: "/gptvis-logo.png",
		href: "https://github.com/antvis/GPT-Vis",
	},
	{
		name: "Vega",
		logo: "/vega-logo.png",
		href: "https://github.com/vega/vega",
	},
	{
		name: "ApexCharts",
		logo: "/apexcharts-logo.png",
		href: "https://github.com/apexcharts/apexcharts.js",
	},
	{
		name: "Avatune",
		logo: "/avatune-logo.png",
		href: "https://www.avatune.dev/",
	},
];

const FEATURES = [
	{
		num: "01",
		title: "FAST, DETERMINISTIC PIXEL DIFF",
		body: "Pure-JS core ~1.5x faster than pixelmatch. Rust binary 3 to 4x faster than odiff, up to 8x on 4K. Wasm build (~32 KB, v128 SIMD) ~5x faster than pixelmatch on 4K in the browser. Reproducible on any machine.",
		illustration: "/home-fast.png",
	},
	{
		num: "02",
		title: "FULL CONTROL, ZERO VENDOR LOCK-IN",
		body: "No SaaS, no API keys, no per-snapshot pricing. Screenshots never leave your machine. Self-hosted from your CI. MIT licensed.",
		illustration: "/home-local.png",
	},
	{
		num: "03",
		title: "AGENT-READY",
		body: "When the heuristic can't decide, the agent hands a small region tile to Claude Code, Cursor, or Codex for judgment. Resume from a checkpoint.",
		illustration: "/home-agent.png",
	},
];

const BENCHMARK_GROUPS = [
	{
		title: "JS CORE VS PIXELMATCH VS WASM CORE",
		subtitle: "4K · IO EXCLUDED · 50 RUNS",
		bars: [
			{ label: "pixelmatch", ms: 302.29 },
			{
				label: "@blazediff/core",
				ms: 211.92,
				highlight: true,
			},
			{
				label: "@blazediff/core-wasm",
				ms: 51.75,
				highlight: true,
			},
		],
	},
	{
		title: "NATIVE BINARY VS ODIFF",
		subtitle: "4K · IO INCLUDED · 25 RUNS",
		bars: [
			{ label: "odiff", ms: 1190.92 },
			{
				label: "@blazediff/core-native",
				ms: 293.86,
				highlight: true,
			},
		],
	},
];

export default function Home() {
	return (
		<LandingShell activeTab="home" ctaLabel="GET STARTED" ctaHref="/apis/core">
			<Hero
				left={
					<>
						<HeroHeading>
							DETERMINISTIC
							<br />
							PIXEL DIFF.
							<br />
							<HeroAccent>AGENT-IN-THE-LOOP</HeroAccent>
							<br />
							<HeroAccent>VERDICTS.</HeroAccent>
						</HeroHeading>
						<HeroSubhead>
							Rust, WASM, and JS diff cores. SSIM and GMSD metrics. Jest,
							Vitest, and Bun matchers. An agent that hands ambiguous diffs to
							Claude Code, Cursor, or Codex. No SaaS. No API key. MIT.
						</HeroSubhead>
						<InstallSnippet commands="npm install @blazediff/core" />
					</>
				}
				right={
					<HeroInterpret
						fixtureBaseline={FIXTURE_A}
						fixtureCurrent={FIXTURE_B}
						imageWidth={interpretData.width}
						imageHeight={interpretData.height}
						regions={interpretData.regions}
					/>
				}
			/>

			<Section title="WHY BLAZEDIFF">
				<div className="flex flex-col gap-20 md:gap-24">
					{FEATURES.map((f, i) => (
						<NumberedCard key={f.num} {...f} reverse={i % 2 === 1} />
					))}
				</div>
			</Section>

			<Section
				title="BENCHMARKS"
				intro="Reproducible from the repo. Same fixtures, same hardware (M1 Max), hyperfine-measured."
			>
				<BenchmarkChart
					groups={BENCHMARK_GROUPS}
					footnote="Full table in BENCHMARKS.md at the repo root. Every row has a fixture and a methodology note."
				/>
			</Section>

			<Section title="USED BY">
				<Reveal className="marquee-mask overflow-hidden">
					<div className="marquee-track flex w-max hover:[animation-play-state:paused]">
						{[0, 1].map((copy) => (
							<div
								key={copy}
								className="flex shrink-0 items-center"
								aria-hidden={copy === 1}
							>
								{USED_BY.map((p) => (
									<a
										key={p.name}
										href={p.href}
										target="_blank"
										rel="noopener noreferrer"
										tabIndex={copy === 1 ? -1 : undefined}
										className="flex shrink-0 flex-col items-center gap-2 px-8 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
									>
										{/* biome-ignore lint/performance/noImgElement: simple logo asset */}
										<img src={p.logo} alt={p.name} className="h-12" />
										<span className="font-mono text-[11px] text-muted uppercase tracking-wider">
											{p.name}
										</span>
									</a>
								))}
							</div>
						))}
					</div>
				</Reveal>
			</Section>

			<Section
				title="THE STACK"
				intro="One monorepo. Four layers. Install one package or the whole stack."
			>
				<div className="flex flex-col gap-12">
					{TIER_ORDER.map((tier) => {
						const items = PACKAGES.filter((p) => p.tier === tier);
						return (
							<div key={tier} className="flex flex-col gap-4">
								<span className="font-mono text-[12px] text-muted uppercase tracking-widest">
									{TIER_LABELS[tier]}
								</span>
								<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
									{items.map((p) => (
										<Link
											key={p.name}
											href={p.href}
											className="bg-surface border border-line p-5 flex flex-col gap-2 relative group hover:border-accent/60 transition-colors"
										>
											<div className="absolute top-0 left-0 w-full h-[2px] bg-transparent group-hover:bg-accent transition-colors" />
											<span className="font-mono text-[14px] text-accent">
												{p.name}
											</span>
											<span className="font-sans text-[13px] text-muted leading-relaxed">
												{p.blurb}
											</span>
										</Link>
									))}
								</div>
							</div>
						);
					})}
				</div>
			</Section>

			<Section>
				<div className="flex flex-col md:flex-row gap-4">
					<CtaLink href="/apis/core" variant="primary">
						READ DOCS
					</CtaLink>
					<CtaLink href="/agent">TRY THE AGENT →</CtaLink>
					<CtaLink href="/docs/pixel-comparison/vanilla-javascript">
						BROWSE EXAMPLES
					</CtaLink>
					<CtaLink href="https://github.com/teimurjan/blazediff" external>
						GITHUB
					</CtaLink>
				</div>
			</Section>
		</LandingShell>
	);
}
