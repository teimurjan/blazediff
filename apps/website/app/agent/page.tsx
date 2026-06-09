import AgentTerminalDemo from "../../components/landing/agent-terminal-demo";
import CtaLink from "../../components/landing/cta-link";
import Hero from "../../components/landing/hero";
import HeroHeading, {
	HeroGradient,
} from "../../components/landing/hero-heading";
import HeroSubhead from "../../components/landing/hero-subhead";
import InstallSnippet from "../../components/landing/install-snippet";
import NumberedCard from "../../components/landing/numbered-card";
import ReportCycling from "../../components/landing/report-cycling";
import Section from "../../components/landing/section";
import LandingShell from "../../components/landing/shell";
import StepCard from "../../components/landing/step-card";
import TerminalFrame from "../../components/landing/terminal-frame";
import interpretData from "../../data/interpret/blazediff-3-diff.json";

export const metadata = {
	title: "Agent",
	description:
		"Open-source visual regression. A deterministic CLI runs the tests; your coding agent (Claude Code, Cursor, Codex) judges ambiguous diffs from compact region tiles. No SaaS, no API key.",
};

const FIXTURE_A =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3a.png";
const FIXTURE_B =
	"https://raw.githubusercontent.com/teimurjan/blazediff/refs/heads/main/fixtures/blazediff/3b.png";

const PRINCIPLES = [
	{
		num: "01",
		title: "YOUR AGENT IS THE JUDGE",
		body: "When the heuristic can't decide, the agent judges compact region tiles and writes a verdict file. No API call leaves your machine.",
		illustration: "/agent-verdict.png",
	},
	{
		num: "02",
		title: "TOKEN-EFFICIENT",
		body: "Region tiles are 10x to 100x smaller than full-page PNGs. The host agent reads only the changed crops first, full pages only on demand.",
		illustration: "/agent-tile.png",
	},
	{
		num: "03",
		title: "ONE PLAYBOOK, THREE HARNESSES",
		body: "One onboard command installs the same skill into Claude Code, Cursor, and Codex. Switch tools without rewriting your testing setup.",
		illustration: "/home-agent.png",
	},
	{
		num: "04",
		title: "MASK, DON'T REBASELINE",
		body: "Carousels, iframes, clocks, randomized avatars. Tag them with a CSS selector once. The agent paints them out in both baseline and actual, so flakiness stops at the source.",
		illustration: "/agent-mask.png",
	},
];

const PROTOCOL = [
	{
		title: "LOCAL - RUN /BLAZEDIFF IN YOUR CODING AGENT",
		command: "/blazediff",
		body: "One slash command in Claude Code, Cursor, or Codex. The skill walks your router, boots the dev server, captures deterministic baselines, and commits a manifest. You review the screenshots and merge.",
	},
	{
		title: "CI - RUN CHECK ON EVERY PR",
		command: "blazediff-agent check",
		body: "One step in CI. Every PR re-renders every route, diffs against the committed baseline, and writes a structured report (change type, position, severity, bbox) per regression. Exit code 1 fails the build.",
	},
];

const AGENT_REPO_URL =
	"https://github.com/teimurjan/blazediff/tree/main/packages/agent";
const SKILL_URL =
	"https://github.com/teimurjan/blazediff/blob/main/skill/blazediff/SKILL.md";

export default function AgentPage() {
	return (
		<LandingShell
			activeTab="agent"
			ctaLabel="GET STARTED"
			ctaHref={AGENT_REPO_URL}
		>
			<Hero
				left={
					<>
						<HeroHeading>
							VISUAL REGRESSION
							<br />
							TESTING FOR YOUR
							<br />
							<HeroGradient>CODING AGENT</HeroGradient>
						</HeroHeading>
						<HeroSubhead>
							YOUR CODING AGENT RUNS THE TESTS AND JUDGES AMBIGUOUS DIFFS FROM
							COMPACT REGION TILES. NO EMBEDDED LLM. NO API KEY. NO PER-SNAPSHOT
							BILL. OPEN SOURCE FROM CLI TO CI.
						</HeroSubhead>
						<InstallSnippet
							commands={[
								"npm install -g @blazediff/agent",
								"blazediff-agent onboard",
							]}
						/>
					</>
				}
				right={
					<TerminalFrame title="~/Projects/blazediff - claude">
						<AgentTerminalDemo />
					</TerminalFrame>
				}
			/>

			<Section
				title="WHY THIS DESIGN"
				intro="FOUR DECISIONS THAT KEEP THE LOOP CHEAP, AUDITABLE, AND OUTSIDE A VENDOR'S CLOUD."
			>
				<div className="flex flex-col gap-20 md:gap-24">
					{PRINCIPLES.map((p, i) => (
						<NumberedCard key={p.num} {...p} reverse={i % 2 === 1} />
					))}
				</div>
			</Section>

			<Section
				title="HOW IT WORKS"
				intro="TWO TOUCHPOINTS. ONE COMMAND TO AUTHOR FROM YOUR CODING AGENT, ONE STEP IN CI TO ENFORCE."
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-8">
					{PROTOCOL.map((step) => (
						<StepCard key={step.title} {...step} />
					))}
				</div>
			</Section>

			<Section
				title="REPORT OUTPUT"
				intro="EVERY CHECK WRITES A 5-COLUMN MARKDOWN REPORT WITH BASELINE, ACTUAL, AND DIFF THUMBNAILS PER ROUTE. THE SAMPLE BELOW IS FROM A REAL RUN ON THIS WEBSITE."
			>
				<TerminalFrame title=".blazediff/summary.md">
					<div className="p-6 bg-canvas flex flex-col gap-6">
						<div className="flex flex-wrap items-center gap-6 border-b border-line pb-4 font-mono text-[13px] uppercase tracking-widest">
							<span className="text-muted">
								TOTAL <span className="text-fg">23</span>
							</span>
							<span className="text-muted">
								PASSED <span className="text-accent">22</span>
							</span>
							<span className="text-muted">
								PENDING <span className="text-magenta">1</span>
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
				</TerminalFrame>
			</Section>

			<Section>
				<div className="flex flex-col md:flex-row gap-4">
					<CtaLink href={AGENT_REPO_URL} variant="primary" external>
						VIEW ON GITHUB
					</CtaLink>
					<CtaLink href="/apis/agent">READ DOCS</CtaLink>
					<CtaLink href={SKILL_URL} external>
						READ THE SKILL
					</CtaLink>
				</div>
			</Section>
		</LandingShell>
	);
}
