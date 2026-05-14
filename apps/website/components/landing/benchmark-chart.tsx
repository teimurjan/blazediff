interface BenchmarkBar {
	label: string;
	ms: number;
	highlight?: boolean;
}

interface BenchmarkGroup {
	title: string;
	subtitle: string;
	bars: BenchmarkBar[];
}

interface BenchmarkChartProps {
	groups: BenchmarkGroup[];
	footnote?: string;
}

function formatMs(ms: number) {
	if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
	if (ms >= 100) return `${Math.round(ms)}ms`;
	return `${ms.toFixed(2)}ms`;
}

export default function BenchmarkChart({
	groups,
	footnote,
}: BenchmarkChartProps) {
	return (
		<div className="flex flex-col gap-10">
			{groups.map((group) => {
				const max = Math.max(...group.bars.map((b) => b.ms));
				return (
					<div
						key={group.title}
						className="flex flex-col gap-4 border border-line bg-surface p-6"
					>
						<div className="flex flex-col gap-1">
							<span className="font-display text-[16px] text-fg uppercase tracking-tight">
								{group.title}
							</span>
							<span className="font-mono text-[12px] text-muted uppercase font-semibold">
								{group.subtitle}
							</span>
						</div>
						<div className="flex flex-col gap-3">
							{group.bars.map((bar) => {
								const widthPct = Math.max(2, (bar.ms / max) * 100);
								return (
									<div key={bar.label} className="flex flex-col gap-1">
										<div className="flex items-baseline justify-between font-mono text-[12px] uppercase">
											<span
												className={bar.highlight ? "text-accent" : "text-muted"}
											>
												{bar.label}
											</span>
											<span
												className={bar.highlight ? "text-accent" : "text-muted"}
											>
												{formatMs(bar.ms)}
											</span>
										</div>
										<div className="h-3 w-full bg-canvas border border-line relative">
											<div
												className={`h-full ${
													bar.highlight ? "bg-accent" : "bg-muted/40"
												}`}
												style={{ width: `${widthPct}%` }}
											/>
										</div>
									</div>
								);
							})}
						</div>
					</div>
				);
			})}
			{footnote && (
				<p className="font-mono text-[12px] text-muted uppercase">{footnote}</p>
			)}
		</div>
	);
}
