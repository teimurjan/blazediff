import Link from "next/link";
import BenchmarkChart from "../components/landing/benchmark-chart";
import CtaLink from "../components/landing/cta-link";
import Hero from "../components/landing/hero";
import HeroHeading, { HeroGradient } from "../components/landing/hero-heading";
import HeroInterpret from "../components/landing/hero-interpret";
import HeroSubhead from "../components/landing/hero-subhead";
import InstallSnippet from "../components/landing/install-snippet";
import NumberedCard from "../components/landing/numbered-card";
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
		href: "/docs/core",
		blurb:
			"Pure-JS pixel diff with two-pass block optimization. ~1.5x faster than pixelmatch with identical accuracy.",
		tier: "foundation",
	},
	{
		name: "@blazediff/core-native",
		href: "/docs/core-native",
		blurb:
			"SIMD-accelerated Rust binary. 3 to 4x faster than odiff, up to 8x faster than pixelmatch on 4K.",
		tier: "foundation",
	},
	{
		name: "@blazediff/core-wasm",
		href: "/docs/core-wasm",
		blurb:
			"Same Rust algorithm, wasm32 v128 SIMD. ~5x faster than pixelmatch on 4K. Browser, edge, any wasm host.",
		tier: "foundation",
	},
	{
		name: "@blazediff/ssim",
		href: "/docs/ssim",
		blurb:
			"SSIM (Structural Similarity Index) for CI visual testing. ~25% faster than ssim.js; Hitchhiker variant ~70% faster.",
		tier: "metrics",
	},
	{
		name: "@blazediff/gmsd",
		href: "/docs/gmsd",
		blurb:
			"GMSD (Gradient Magnitude Similarity Deviation) metric for CI visual testing. Single-threaded, allocation-free hot path.",
		tier: "metrics",
	},
	{
		name: "@blazediff/object",
		href: "/docs/object",
		blurb:
			"Object comparison with path tracking, cycle detection, and CREATE/REMOVE/CHANGE types. ~55% faster than microdiff.",
		tier: "metrics",
	},
	{
		name: "@blazediff/jest",
		href: "/docs/jest",
		blurb: "Jest matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/vitest",
		href: "/docs/vitest",
		blurb: "Vitest matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/bun",
		href: "/docs/bun",
		blurb: "Bun test matcher for visual regression testing.",
		tier: "harness",
	},
	{
		name: "@blazediff/matcher",
		href: "/docs/matcher",
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
		href: "/docs/cli",
		blurb: "Command-line interface for image comparison.",
		tier: "surfaces",
	},
	{
		name: "@blazediff/ui",
		href: "/docs/ui",
		blurb: "Unstyled web components for displaying image differences.",
		tier: "surfaces",
	},
	{
		name: "@blazediff/react",
		href: "/docs/react",
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
];

const FEATURES = [
	{
		num: "01",
		title: "DETERMINISTIC",
		body: "Pure-JS core ~1.5x faster than pixelmatch. Rust binary 3 to 4x faster than odiff, up to 8x on 4K. Wasm build (~32 KB, v128 SIMD) ~5x faster than pixelmatch on 4K in the browser. Reproducible on any machine.",
		illustration: "/home-determenistic.png",
	},
	{
		num: "02",
		title: "LOCAL",
		body: "No SaaS, no API keys, no per-snapshot pricing. Screenshots never leave your machine. Self-hosted from your CI. MIT licensed.",
		illustration: "/home-local.png",
	},
	{
		num: "03",
		title: "AGENT-READY",
		body: "When the heuristic can't decide, the agent hands a small region tile to Claude Code, Cursor, or Codex for judgment. Resume from a checkpoint.",
		illustration: "/agent-skill.png",
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
		<LandingShell activeTab="home" ctaLabel="GET STARTED" ctaHref="/docs/core">
			<Hero
				left={
					<>
						<HeroHeading>
							DETERMINISTIC
							<br />
							PIXEL DIFF.
							<br />
							<HeroGradient>AGENT-IN-THE-LOOP</HeroGradient>
							<br />
							<HeroGradient>VERDICTS.</HeroGradient>
						</HeroHeading>
						<HeroSubhead>
							RUST, WASM, AND JS DIFF CORES. SSIM AND GMSD METRICS. JEST,
							VITEST, AND BUN MATCHERS. AN AGENT THAT HANDS AMBIGUOUS DIFFS TO
							CLAUDE CODE, CURSOR, OR CODEX. NO SAAS. NO API KEY. MIT.
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
				intro="REPRODUCIBLE FROM THE REPO. SAME FIXTURES, SAME HARDWARE (M1 MAX), HYPERFINE-MEASURED."
			>
				<BenchmarkChart
					groups={BENCHMARK_GROUPS}
					footnote="FULL TABLE IN BENCHMARKS.MD AT THE REPO ROOT. EVERY ROW HAS A FIXTURE AND A METHODOLOGY NOTE."
				/>
			</Section>

			<Section title="USED BY">
				<div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-8 items-center">
					{USED_BY.map((p) => (
						<a
							key={p.name}
							href={p.href}
							target="_blank"
							rel="noopener noreferrer"
							className="flex flex-col items-center gap-2 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
						>
							{/* biome-ignore lint/performance/noImgElement: simple logo asset */}
							<img src={p.logo} alt={p.name} className="h-12" />
							<span className="font-mono text-[11px] text-muted uppercase tracking-wider">
								{p.name}
							</span>
						</a>
					))}
				</div>
			</Section>

			<Section
				title="THE STACK"
				intro="ONE MONOREPO. FOUR LAYERS. INSTALL ONE PACKAGE OR THE WHOLE STACK."
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
					<CtaLink href="/docs/core" variant="primary">
						READ DOCS
					</CtaLink>
					<CtaLink href="/agent">TRY THE AGENT →</CtaLink>
					<CtaLink href="/examples/image-comparison">BROWSE EXAMPLES</CtaLink>
					<CtaLink href="https://github.com/teimurjan/blazediff" external>
						GITHUB
					</CtaLink>
				</div>
			</Section>
		</LandingShell>
	);
}
