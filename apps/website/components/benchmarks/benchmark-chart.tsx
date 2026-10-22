"use client";

import type { ReactNode } from "react";
import { useInView } from "../../hooks/use-in-view";
import { type BenchmarkUnit, formatValue } from "./format";

interface BenchmarkBar {
	label: string;
	value: number;
	highlight?: boolean;
}

export interface BenchmarkGroup {
	id: string;
	title: string;
	subtitle: string;
	unit: BenchmarkUnit;
	bars: BenchmarkBar[];
}

interface BenchmarkChartProps {
	groups: BenchmarkGroup[];
	footnote?: ReactNode;
}

function BenchmarkGroupCard({ group }: { group: BenchmarkGroup }) {
	const [ref, isInView] = useInView(0.25);
	const max = Math.max(...group.bars.map((b) => b.value));

	return (
		<div
			ref={ref}
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
				{group.bars.map((bar, i) => {
					const widthPct = Math.max(2, (bar.value / max) * 100);
					return (
						<div key={bar.label} className="flex flex-col gap-1">
							<div className="flex items-baseline justify-between font-mono text-[12px] uppercase">
								<span className={bar.highlight ? "text-accent" : "text-muted"}>
									{bar.label}
								</span>
								<span className={bar.highlight ? "text-accent" : "text-muted"}>
									{formatValue(bar.value, group.unit)}
								</span>
							</div>
							<div className="h-3 w-full bg-canvas border border-line relative overflow-hidden">
								<div
									className={`h-full transition-[width] duration-1000 ease-out motion-reduce:transition-none ${
										bar.highlight ? "bg-accent" : "bg-muted/40"
									}`}
									style={{
										width: isInView ? `${widthPct}%` : "0%",
										transitionDelay: `${i * 80}ms`,
									}}
								/>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

export default function BenchmarkChart({
	groups,
	footnote,
}: BenchmarkChartProps) {
	return (
		<div className="flex flex-col gap-10">
			{groups.map((group) => (
				<BenchmarkGroupCard key={group.id} group={group} />
			))}
			{footnote && (
				<div className="font-sans text-[13px] text-muted leading-relaxed">
					{footnote}
				</div>
			)}
		</div>
	);
}
