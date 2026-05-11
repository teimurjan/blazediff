import { IconBolt, IconBox, IconFeather } from "@tabler/icons-react";
import Link from "next/link";
import HeroDiff from "../components/hero-diff";
import LandingFooter from "../components/landing/footer";
import InstallSnippet from "../components/landing/install-snippet";
import LandingNav from "../components/landing/nav";

const PACKAGES = [
	{
		name: "@blazediff/core",
		href: "/docs/core",
		blurb:
			"Blazing-fast pixel-by-pixel image comparison with block-based optimization. 1.5x faster than pixelmatch.",
	},
	{
		name: "@blazediff/core-native",
		href: "/docs/core-native",
		blurb:
			"Native Rust binaries with SIMD. The fastest image diff in the world.",
	},
	{
		name: "@blazediff/ssim",
		href: "/docs/ssim",
		blurb:
			"Fast single-threaded SSIM (Structural Similarity Index) metric for CI visual testing.",
	},
	{
		name: "@blazediff/gmsd",
		href: "/docs/gmsd",
		blurb:
			"Fast single-threaded GMSD (Gradient Magnitude Similarity Deviation) metric for CI visual testing.",
	},
	{
		name: "@blazediff/object",
		href: "/docs/object",
		blurb:
			"Blazing-fast object comparison with path tracking, cycle detection, and CREATE/REMOVE/CHANGE types.",
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

const POWERING = [
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
		blurb:
			"1.5–4× faster than pixelmatch and odiff. Native Rust + SIMD for the hot path.",
	},
	{
		num: "02",
		title: "SMALL",
		icon: IconFeather,
		blurb:
			"~700KB native binary, zero-dependency JS core. Drop it into any pipeline.",
	},
	{
		num: "03",
		title: "TYPE-SAFE",
		icon: IconBox,
		blurb:
			"TypeScript out of the box. Matchers for Jest, Vitest, and Bun ship typed.",
	},
];

export default function Home() {
	return (
		<div
			className="min-h-screen flex flex-col bg-[#0a0a0f] text-[#f0ece8] font-[var(--font-inter)]"
			style={{
				backgroundImage:
					"linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
				backgroundSize: "40px 40px",
			}}
		>
			<LandingNav
				activeTab="home"
				ctaLabel="GET STARTED"
				ctaHref="/docs/core"
			/>

			<main className="flex-grow flex flex-col">
				{/* Hero */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 lg:py-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
					<div className="flex flex-col gap-8">
						<h1 className="font-[var(--font-space-grotesk)] text-[48px] lg:text-[72px] font-extrabold text-[#f0ece8] uppercase tracking-tighter leading-none">
							BLAZING FAST
							<br />
							IMAGE DIFFING
							<br />
							FOR YOUR{" "}
							<span
								className="bg-clip-text text-transparent"
								style={{
									backgroundImage:
										"linear-gradient(to right, #ff7a1a, #ff2e8b)",
								}}
							>
								UI PIPELINE
							</span>
						</h1>
						<p className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#7a7585] max-w-lg uppercase">
							HIGH-PERFORMANCE IMAGE COMPARISON BUILT FOR CI. PIXEL-BY-PIXEL,
							SSIM, GMSD, AND STRUCTURED INTERPRET - ALL FROM ONE TOOLKIT.
						</p>
						<InstallSnippet command="npm install @blazediff/core" />
					</div>

					<div className="relative">
						<div className="bg-[#1c1c26] border border-[#2a2a38] p-2 flex flex-col gap-2 relative">
							<div className="flex items-center justify-between border-b border-[#2a2a38] pb-2 px-2">
								<span className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#ff7a1a]">
									$ npx @blazediff/cli a.png b.png --diff diff.png
								</span>
								<div className="flex gap-2 shrink-0">
									<div className="w-2 h-2 bg-[#7a7585]" />
									<div className="w-2 h-2 bg-[#7a7585]" />
									<div className="w-2 h-2 bg-[#ff2e8b]" />
								</div>
							</div>
							<div className="p-3 bg-[#0a0a0f]">
								<HeroDiff
									fixtureA="https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3a.png"
									fixtureB="https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3b.png"
								/>
							</div>
						</div>
					</div>
				</section>

				{/* Features */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<h2 className="font-[var(--font-space-grotesk)] text-[24px] text-[#f0ece8] mb-12 uppercase tracking-tight">
						WHY BLAZEDIFF
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
						{FEATURES.map((f) => {
							const Icon = f.icon;
							return (
								<div
									key={f.num}
									className="bg-[#15151c] border border-[#2a2a38] p-8 flex flex-col gap-4 relative group"
								>
									<div className="absolute top-0 left-0 w-full h-1 bg-[#2a2a38] group-hover:bg-[#ff7a1a] transition-colors" />
									<div className="flex items-start justify-between">
										<span className="font-[var(--font-space-grotesk)] text-[48px] font-bold text-[#7a7585] opacity-30">
											{f.num}
										</span>
										<Icon size={32} className="text-[#ff7a1a]" />
									</div>
									<h3 className="font-[var(--font-space-grotesk)] text-[18px] font-semibold text-[#f0ece8] uppercase mt-4">
										{f.title}
									</h3>
									<p className="font-[var(--font-inter)] text-[14px] text-[#7a7585]">
										{f.blurb}
									</p>
								</div>
							);
						})}
					</div>
				</section>

				{/* Powering */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<h2 className="font-[var(--font-space-grotesk)] text-[24px] text-[#f0ece8] mb-12 uppercase tracking-tight">
						POWERING
					</h2>
					<div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-8 gap-8 items-center">
						{POWERING.map((p) => (
							<a
								key={p.name}
								href={p.href}
								target="_blank"
								rel="noopener noreferrer"
								className="flex flex-col items-center gap-2 grayscale hover:grayscale-0 opacity-70 hover:opacity-100 transition-all"
							>
								{/* biome-ignore lint/performance/noImgElement: simple logo asset */}
								<img src={p.logo} alt={p.name} className="h-12" />
								<span className="font-[var(--font-jetbrains-mono)] text-[11px] text-[#7a7585] uppercase tracking-wider">
									{p.name}
								</span>
							</a>
						))}
					</div>
				</section>

				{/* Packages */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<h2 className="font-[var(--font-space-grotesk)] text-[24px] text-[#f0ece8] mb-12 uppercase tracking-tight">
						PACKAGES
					</h2>
					<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
						{PACKAGES.map((p) => (
							<Link
								key={p.name}
								href={p.href}
								className="bg-[#15151c] border border-[#2a2a38] p-5 flex flex-col gap-2 relative group hover:border-[#ff7a1a]/60 transition-colors"
							>
								<div className="absolute top-0 left-0 w-full h-[2px] bg-transparent group-hover:bg-[#ff7a1a] transition-colors" />
								<span className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#ff7a1a]">
									{p.name}
								</span>
								<span className="font-[var(--font-inter)] text-[13px] text-[#7a7585] leading-relaxed">
									{p.blurb}
								</span>
							</Link>
						))}
					</div>
				</section>

				{/* CTAs */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<div className="flex flex-col md:flex-row gap-4">
						<Link
							href="/docs/core"
							className="bg-[#ff7a1a] text-[#0a0a0f] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:shadow-[0_0_12px_rgba(255,122,26,0.4)] transition-all"
						>
							READ DOCS
						</Link>
						<Link
							href="/examples/image-comparison"
							className="border border-[#2a2a38] text-[#f0ece8] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:border-[#ff7a1a] transition-colors"
						>
							BROWSE EXAMPLES
						</Link>
						<Link
							href="/agent"
							className="border border-[#2a2a38] text-[#f0ece8] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:border-[#ff7a1a] transition-colors"
						>
							TRY THE AGENT →
						</Link>
						<a
							href="https://github.com/teimurjan/blazediff"
							target="_blank"
							rel="noopener noreferrer"
							className="border border-[#2a2a38] text-[#f0ece8] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:border-[#ff7a1a] transition-colors"
						>
							GITHUB
						</a>
					</div>
				</section>
			</main>

			<LandingFooter />
		</div>
	);
}
