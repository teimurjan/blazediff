import Section from "./section";

export interface FaqItem {
	question: string;
	answer: string;
}

/**
 * Rendered on the homepage and mirrored into FAQPage JSON-LD by
 * `structured-data.tsx`. Answers are self-contained on purpose: search and
 * answer engines quote a single pair without the surrounding page.
 */
export const FAQ_ITEMS: FaqItem[] = [
	{
		question: "What is BlazeDiff?",
		answer:
			"BlazeDiff is an open-source visual regression toolkit for JavaScript and TypeScript. It ships deterministic pixel-diff cores in Rust, WebAssembly, and pure JS, SSIM and GMSD similarity metrics, matchers for Jest, Vitest, and Bun, and an agent that hands ambiguous diffs to a coding agent for a verdict. It is MIT licensed and runs entirely on your own machine or CI.",
	},
	{
		question: "How is BlazeDiff different from pixelmatch and odiff?",
		answer:
			"BlazeDiff is faster at identical accuracy. On a 4K pair with IO excluded (M1 Max, 50 runs), pixelmatch takes 302.29ms and @blazediff/core takes 211.92ms; the WebAssembly core runs the same pair in 34.42ms. With IO included, odiff takes 1265.82ms against 275.42ms for the native Rust binary. BlazeDiff also adds SSIM and GMSD metrics plus agent-based judgment of ambiguous diffs, which neither library provides.",
	},
	{
		question: "Do I need an API key or a paid plan?",
		answer:
			"No. BlazeDiff has no SaaS component, no API key, and no per-snapshot pricing. Screenshots never leave your machine, and ambiguous diffs are judged by a coding agent you already run (Claude Code, Cursor, or Codex) rather than by a hosted vision service.",
	},
	{
		question: "Which test runners does BlazeDiff support?",
		answer:
			"BlazeDiff ships first-party matchers for Jest (@blazediff/jest), Vitest (@blazediff/vitest), and the Bun test runner (@blazediff/bun), all built on the shared @blazediff/matcher core. Screenshots from Playwright, Puppeteer, or any tool that writes PNG files work as input.",
	},
	{
		question: "What does agent-in-the-loop mean?",
		answer:
			"Deterministic thresholds decide most diffs on their own. When a diff is ambiguous, BlazeDiff crops the changed regions into small tiles and hands them to your coding agent, which returns a pass or fail verdict with a reason. Runs are checkpointed, so a suite can resume instead of starting over.",
	},
	{
		question: "Can BlazeDiff run in the browser?",
		answer:
			"Yes. @blazediff/core-wasm is a roughly 32 KB WebAssembly build using v128 SIMD that runs the same Rust algorithm as the native binary, up to about 9x faster than pixelmatch on 4K images. It works in browsers, edge runtimes, and any WebAssembly host.",
	},
	{
		question: "Is BlazeDiff free to use commercially?",
		answer:
			"Yes. BlazeDiff is MIT licensed, so it can be used in commercial and closed-source projects at no cost, including in CI. There is no usage cap and no separate commercial tier.",
	},
];

export default function LandingFaq() {
	return (
		<Section
			title="FAQ"
			intro="Common questions about how BlazeDiff compares, what it costs, and where it runs."
		>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				{FAQ_ITEMS.map((item) => (
					<div
						key={item.question}
						className="bg-surface border border-line p-5 flex flex-col gap-2"
					>
						<h3 className="font-mono text-[14px] text-accent">
							{item.question}
						</h3>
						<p className="font-sans text-[13px] text-muted leading-relaxed">
							{item.answer}
						</p>
					</div>
				))}
			</div>
		</Section>
	);
}
