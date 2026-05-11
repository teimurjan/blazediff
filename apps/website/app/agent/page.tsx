import Link from "next/link";
import LandingFooter from "../../components/landing/footer";
import InstallSnippet from "../../components/landing/install-snippet";
import LandingNav from "../../components/landing/nav";
import ReportCycling from "../../components/landing/report-cycling";
import interpretData from "../../data/interpret/blazediff-3-diff.json";

export const metadata = {
	title: "Agent",
	description:
		"BlazeDiff Agent - autonomous visual regression testing for your coding agent. Pixel-level deviation detection wired into CI/CD.",
};

const PROTOCOL = [
	{
		num: "01",
		title: "LOCAL - RUN /BLAZEDIFF IN YOUR CODING AGENT",
		command: "/blazediff",
		blurb:
			"One slash command in Claude Code, Cursor, or any agent loading the BlazeDiff skill. The skill installs the CLI, reads your router, boots the dev server, and writes deterministic baselines + a manifest to .blazediff/. Commit the folder.",
	},
	{
		num: "02",
		title: "CI - RUN CHECK ON EVERY PR",
		command: "blazediff-agent check",
		blurb:
			"Drop one step into your CI workflow. Each PR re-renders every route, pixel-compares against the committed baselines, and fails the build on regressions - with structured interpret output (change type, position, severity, bbox) attached to the report.",
	},
];

const FIXTURE_A =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3a.png";
const FIXTURE_B =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3b.png";

export default function AgentPage() {
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
				activeTab="agent"
				ctaLabel="GET STARTED"
				ctaHref="https://github.com/teimurjan/blazediff/tree/main/packages/agent"
			/>

			<main className="flex-grow flex flex-col">
				{/* Hero */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 lg:py-32 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
					<div className="flex flex-col gap-8">
						<h1 className="font-[var(--font-space-grotesk)] text-[48px] lg:text-[72px] font-extrabold text-[#f0ece8] uppercase tracking-tighter leading-none">
							VISUAL REGRESSION
							<br />
							TESTING FOR YOUR
							<br />
							<span
								className="bg-clip-text text-transparent"
								style={{
									backgroundImage:
										"linear-gradient(to right, #ff7a1a, #ff2e8b)",
								}}
							>
								CODING AGENT
							</span>
						</h1>
						<p className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#7a7585] max-w-lg uppercase">
							INTEGRATE AUTONOMOUS UI VALIDATION DIRECTLY INTO YOUR CI/CD
							PIPELINE. DETECT PIXEL-LEVEL DEVIATIONS BEFORE THEY HIT
							PRODUCTION.
						</p>
						<InstallSnippet command="npm install -g @blazediff/agent" />
					</div>

					<div className="relative">
						<div className="bg-[#1c1c26] border border-[#2a2a38] p-2 flex flex-col gap-2 relative">
							<div className="flex items-center justify-between border-b border-[#2a2a38] pb-2 px-2">
								<span className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#ff7a1a]">
									~/Projects/blazediff - claude
								</span>
								<div className="flex gap-2 shrink-0">
									<div className="w-2 h-2 bg-[#7a7585]" />
									<div className="w-2 h-2 bg-[#7a7585]" />
									<div className="w-2 h-2 bg-[#ff2e8b]" />
								</div>
							</div>

							<pre className="p-4 bg-[#0a0a0f] font-[var(--font-jetbrains-mono)] text-[12px] leading-[1.55] text-[#f0ece8] whitespace-pre overflow-x-auto">
								<span className="text-[#7a7585]">(base) </span>
								<span className="text-[#ff7a1a]">➜ blazediff</span>
								<span className="text-[#7a7585]"> git:(</span>
								<span className="text-[#ff2e8b]">main</span>
								<span className="text-[#7a7585]">) </span>
								<span className="text-[#ff2e8b]">✗</span>
								<span className="text-[#f0ece8]"> claude</span>
								{"\n"}
								<span className="text-[#ff7a1a]">{" ▐▛███▜▌"}</span>
								<span className="text-[#7a7585]"> Claude Code v2.1.138</span>
								{"\n"}
								<span className="text-[#ff7a1a]">{"▝▜█████▛▘"}</span>
								<span className="text-[#7a7585]">
									{"  Opus 4.7 (1M context) · Claude Max"}
								</span>
								{"\n"}
								<span className="text-[#ff7a1a]">{"  ▘▘ ▝▝"}</span>
								<span className="text-[#7a7585]">
									{"    ~/Projects/blazediff/blazediff"}
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">❯</span>
								<span className="text-[#f0ece8]">
									{" "}
									/blazediff --cwd apps/website
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">⏺</span>
								<span className="text-[#f0ece8]"> Bash(</span>
								<span className="text-[#7a7585]">
									test -f apps/website/.blazediff/manifest.json && echo EXISTS
								</span>
								<span className="text-[#f0ece8]">)</span>
								{"\n"}
								<span className="text-[#7a7585]"> ⎿ EXISTS</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">⏺</span>
								<span className="text-[#f0ece8]">
									{" Check mode - running blazediff-agent."}
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">⏺</span>
								<span className="text-[#f0ece8]"> Bash(</span>
								<span className="text-[#7a7585]">
									blazediff-agent --cwd apps/website check --json
								</span>
								<span className="text-[#f0ece8]">)</span>
								{"\n"}
								<span className="text-[#7a7585]"> ⎿ {"{"}</span>
								{"\n"}
								<span className="text-[#7a7585]"> "totalEntries": </span>
								<span className="text-[#f0ece8]">22</span>
								<span className="text-[#7a7585]">,</span>
								{"\n"}
								<span className="text-[#7a7585]"> "passed": </span>
								<span className="text-[#ff7a1a]">20</span>
								<span className="text-[#7a7585]">,</span>
								{"\n"}
								<span className="text-[#7a7585]"> "failed": </span>
								<span className="text-[#ff2e8b]">2</span>
								<span className="text-[#7a7585]">,</span>
								{"\n"}
								<span className="text-[#7a7585]">
									{"     … +84 lines (ctrl+o to expand)"}
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">⏺</span>
								<span className="text-[#f0ece8]"> 20/22 passed (</span>
								<span className="text-[#ff2e8b]">2 failed</span>
								<span className="text-[#f0ece8]">):</span>
								{"\n"}
								<span className="text-[#7a7585]"> ⎿ </span>
								<span className="text-[#ff2e8b]">✗ docs-react</span>
								<span className="text-[#7a7585]">
									{"      content-change · top-left · low"}
								</span>
								{"\n"}
								<span className="text-[#7a7585]"> ⎿ </span>
								<span className="text-[#ff2e8b]">✗ examples-react</span>
								<span className="text-[#7a7585]">
									{"  content-change · top-left · low"}
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">⏺</span>
								<span className="text-[#f0ece8]">
									{
										" Report at apps/website/.blazediff/report.json. Fix or re-baseline?"
									}
								</span>
								{"\n\n"}
								<span className="text-[#ff7a1a]">❯</span>
								<span className="text-[#7a7585]"> </span>
								<span className="inline-block w-2 h-[14px] align-middle bg-[#ff7a1a] animate-pulse" />
							</pre>
						</div>
					</div>
				</section>

				{/* How It Works */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<h2 className="font-[var(--font-space-grotesk)] text-[24px] text-[#f0ece8] mb-4 uppercase tracking-tight">
						HOW IT WORKS
					</h2>
					<p className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#7a7585] mb-12 max-w-2xl uppercase">
						TWO TOUCHPOINTS. ONE COMMAND TO AUTHOR FROM YOUR CODING AGENT, ONE
						STEP IN CI TO ENFORCE.
					</p>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
						{PROTOCOL.map((step) => (
							<div
								key={step.num}
								className="bg-[#15151c] border border-[#2a2a38] p-8 flex flex-col gap-4 relative group"
							>
								<div className="absolute top-0 left-0 w-full h-1 bg-[#2a2a38] group-hover:bg-[#ff7a1a] transition-colors" />
								<span className="font-[var(--font-space-grotesk)] text-[48px] font-bold text-[#7a7585] opacity-30">
									{step.num}
								</span>
								<h3 className="font-[var(--font-space-grotesk)] text-[18px] font-semibold text-[#f0ece8] uppercase mt-4">
									{step.title}
								</h3>
								<code className="font-[var(--font-jetbrains-mono)] text-[12px] text-[#ff7a1a] bg-[#0a0a0f] border border-[#2a2a38] px-2 py-1 self-start">
									$ {step.command}
								</code>
								<p className="font-[var(--font-inter)] text-[14px] text-[#7a7585]">
									{step.blurb}
								</p>
							</div>
						))}
					</div>
				</section>

				{/* Report Preview */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<h2 className="font-[var(--font-space-grotesk)] text-[24px] text-[#f0ece8] mb-4 uppercase tracking-tight">
						REPORT OUTPUT
					</h2>
					<p className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#7a7585] mb-12 max-w-2xl uppercase">
						EVERY CHECK WRITES A STRUCTURED REPORT. PER-ROUTE STATUS, FAILING
						REGIONS WITH INTERPRET FIELDS - CHANGETYPE, POSITION, SEVERITY,
						BBOX. SAMPLE BELOW IS FROM A REAL RUN ON THIS WEBSITE.
					</p>

					<div className="bg-[#1c1c26] border border-[#2a2a38] p-2 flex flex-col gap-2">
						<div className="flex items-center justify-between border-b border-[#2a2a38] pb-2 px-2">
							<span className="font-[var(--font-jetbrains-mono)] text-[14px] text-[#ff7a1a]">
								.blazediff/report.json
							</span>
							<div className="flex gap-2 shrink-0">
								<div className="w-2 h-2 bg-[#7a7585]" />
								<div className="w-2 h-2 bg-[#7a7585]" />
								<div className="w-2 h-2 bg-[#ff2e8b]" />
							</div>
						</div>

						<div className="p-6 bg-[#0a0a0f] flex flex-col gap-6">
							{/* Summary bar */}
							<div className="flex flex-wrap items-center gap-6 border-b border-[#2a2a38] pb-4 font-[var(--font-jetbrains-mono)] text-[13px] uppercase tracking-widest">
								<span className="text-[#7a7585]">
									TOTAL <span className="text-[#f0ece8]">22</span>
								</span>
								<span className="text-[#7a7585]">
									FAILED <span className="text-[#ff2e8b]">1</span>
								</span>
							</div>

							{/** biome-ignore lint/correctness/useUniqueElementIds: ID is not for HTML, it's a prop */}
							<ReportCycling
								id="examples-interpret"
								fixtureBaseline={FIXTURE_A}
								fixtureCurrent={FIXTURE_B}
								imageWidth={interpretData.width}
								imageHeight={interpretData.height}
								regions={interpretData.regions}
								diffPercentage={interpretData.diffPercentage}
								severity={interpretData.severity}
							/>
						</div>
					</div>
				</section>

				{/* CTAs */}
				<section className="w-full max-w-screen-2xl mx-auto px-10 py-20 border-t border-[#2a2a38]">
					<div className="flex flex-col md:flex-row gap-4">
						<a
							href="https://github.com/teimurjan/blazediff/tree/main/packages/agent"
							target="_blank"
							rel="noopener noreferrer"
							className="bg-[#ff7a1a] text-[#0a0a0f] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:shadow-[0_0_12px_rgba(255,122,26,0.4)] transition-all"
						>
							VIEW ON GITHUB
						</a>
						<Link
							href="/docs/core"
							className="border border-[#2a2a38] text-[#f0ece8] font-[var(--font-jetbrains-mono)] text-[14px] uppercase px-6 py-3 hover:border-[#ff7a1a] transition-colors"
						>
							READ DOCS
						</Link>
					</div>
				</section>
			</main>

			<LandingFooter />
		</div>
	);
}
