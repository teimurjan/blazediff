export default function AgentTerminalDemo() {
	return (
		<pre className="p-4 bg-canvas font-mono text-[12px] leading-[1.55] text-fg whitespace-pre overflow-x-auto">
			<span className="text-muted">(base) </span>
			<span className="text-accent">➜ blazediff</span>
			<span className="text-muted"> git:(</span>
			<span className="text-magenta">main</span>
			<span className="text-muted">) </span>
			<span className="text-magenta">✗</span>
			<span className="text-fg"> claude</span>
			{"\n\n"}
			<span className="text-accent">❯</span>
			<span className="text-fg"> /blazediff --cwd apps/website</span>
			{"\n\n"}
			<span className="text-accent">⏺</span>
			<span className="text-fg"> Bash(</span>
			<span className="text-muted">
				blazediff-agent run --judge host --json
			</span>
			<span className="text-fg">)</span>
			{"\n"}
			<span className="text-muted"> ⎿ 21/23 passed, </span>
			<span className="text-magenta">2 ambiguous</span>
			{"\n\n"}
			<span className="text-accent">⏺</span>
			<span className="text-fg"> Read(</span>
			<span className="text-muted">.blazediff/judgments/*/regions.png</span>
			<span className="text-fg">)</span>
			{"\n\n"}
			<span className="text-accent">⏺</span>
			<span className="text-fg">
				{" Both: em-dash → hyphen. Intentional. Writing verdicts."}
			</span>
			{"\n\n"}
			<span className="text-accent">⏺</span>
			<span className="text-fg"> 21/23 passed, </span>
			<span className="text-accent">2 intentional-likely</span>
			<span className="text-fg">. Rewrite baselines?</span>
			{"\n\n"}
			<span className="text-accent">❯</span>
			<span className="text-muted"> </span>
			<span className="inline-block w-2 h-[14px] align-middle bg-accent animate-pulse" />
		</pre>
	);
}
