import { IconBolt, IconLayoutGrid, IconLockOpen } from "@tabler/icons-react";
import Link from "next/link";
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

const PACKAGES = [
	{
		name: "@blazediff/core",
		href: "/docs/core",
		blurb:
			"Pure-JS pixel diff with two-pass block optimization. ~1.5x faster than pixelmatch with identical accuracy.",
	},
	{
		name: "@blazediff/core-native",
		href: "/docs/core-native",
		blurb:
			"SIMD-accelerated Rust binary. 3 to 4x faster than odiff, up to 8x faster than pixelmatch on 4K.",
	},
	{
		name: "@blazediff/ssim",
		href: "/docs/ssim",
		blurb:
			"SSIM (Structural Similarity Index) for CI visual testing. ~25% faster than ssim.js; Hitchhiker variant ~70% faster.",
	},
	{
		name: "@blazediff/gmsd",
		href: "/docs/gmsd",
		blurb:
			"GMSD (Gradient Magnitude Similarity Deviation) metric for CI visual testing. Single-threaded, allocation-free hot path.",
	},
	{
		name: "@blazediff/object",
		href: "/docs/object",
		blurb:
			"Object comparison with path tracking, cycle detection, and CREATE/REMOVE/CHANGE types. ~55% faster than microdiff.",
	},
	{
		name: "@blazediff/agent",
		href: "/agent",
		blurb:
			"Visual regression that your coding agent runs. Onboards Claude Code, Cursor, Codex. No API key required.",
	},
	{
		name: "@blazediff/cli",
		href: "/docs/cli",
		blurb: "Command-line interface for image comparison.",
	},
	{
		name: "@blazediff/jest",
		href: "/docs/jest",
		blurb: "Jest matcher for visual regression testing.",
	},
	{
		name: "@blazediff/vitest",
		href: "/docs/vitest",
		blurb: "Vitest matcher for visual regression testing.",
	},
	{
		name: "@blazediff/bun",
		href: "/docs/bun",
		blurb: "Bun test matcher for visual regression testing.",
	},
	{
		name: "@blazediff/matcher",
		href: "/docs/matcher",
		blurb: "Core matcher logic for visual regression testing.",
	},
	{
		name: "@blazediff/ui",
		href: "/docs/ui",
		blurb: "Unstyled web components for displaying image differences.",
	},
	{
		name: "@blazediff/react",
		href: "/docs/react",
		blurb: "React components for image comparison.",
	},
	{
		name: "@blazediff/codec-sharp",
		href: "/docs/core-native",
		blurb: "Image codec using Sharp.",
	},
	{
		name: "@blazediff/codec-pngjs",
		href: "/docs/core-native",
		blurb: "PNG image codec using pngjs.",
	},
	{
		name: "@blazediff/codec-jsquash-png",
		href: "/docs/core-native",
		blurb: "WASM-based PNG image codec using @jsquash/png.",
	},
];

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
		title: "FAST",
		icon: IconBolt,
		body: "1.5x faster pure JS. Up to 8x faster native on 4K. Two-pass block optimization with YIQ perceptual color and anti-aliasing detection.",
	},
	{
		num: "02",
		title: "EVERYWHERE",
		icon: IconLayoutGrid,
		body: "One Rust core, six surfaces. Node + Bun via npm, Deno via JSR, Python via PyPI, Rust via crates.io. Five prebuilt binaries.",
	},
	{
		num: "03",
		title: "OPEN",
		icon: IconLockOpen,
		body: "MIT licensed. No SaaS, no API keys, no per-snapshot pricing. Self-hosted from your CI. Matchers for Jest, Vitest, Bun.",
	},
];

export default function Home() {
	return (
		<LandingShell activeTab="home" ctaLabel="GET STARTED" ctaHref="/docs/core">
			<Hero
				left={
					<>
						<HeroHeading>
							BLAZING FAST
							<br />
							IMAGE DIFFING
							<br />
							FOR YOUR <HeroGradient>UI PIPELINE</HeroGradient>
						</HeroHeading>
						<HeroSubhead>
							RUST CORE WITH SIMD. UP TO 8X FASTER THAN PIXELMATCH ON 4K, 3 TO
							4X FASTER THAN ODIFF. PIXEL-BY-PIXEL, SSIM, GMSD, OBJECT DIFF, AND
							AN AGENT FOR VISUAL REGRESSION. NODE, BUN, DENO, PYTHON, RUST.
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
				<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
					{FEATURES.map((f) => (
						<NumberedCard key={f.num} {...f} />
					))}
				</div>
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

			<Section title="PACKAGES">
				<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
					{PACKAGES.map((p) => (
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
			</Section>

			<Section>
				<div className="flex flex-col md:flex-row gap-4">
					<CtaLink href="/docs/core" variant="primary">
						READ DOCS
					</CtaLink>
					<CtaLink href="/examples/image-comparison">BROWSE EXAMPLES</CtaLink>
					<CtaLink href="/agent">TRY THE AGENT →</CtaLink>
					<CtaLink href="https://github.com/teimurjan/blazediff" external>
						GITHUB
					</CtaLink>
				</div>
			</Section>
		</LandingShell>
	);
}
