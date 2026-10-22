"use client";

import { useEffect, useRef, useState } from "react";
import { type BenchmarkUnit, formatTick, formatValue } from "./format";

export interface ColumnBar {
	id: string;
	name: string;
	version?: string;
	value: number;
	highlight: boolean;
	/** How this bar compares to the baseline, e.g. "4.21x faster than odiff". */
	comparison: string;
}

interface ColumnChartProps {
	label: string;
	unit: BenchmarkUnit;
	bars: ColumnBar[];
}

const HEIGHT = 300;
const MARGIN = { top: 28, right: 8, bottom: 60, left: 56 };
const BAR_WIDTH = 24;
const RADIUS = 4;
const TICK_TARGET = 4;
const LINE_HEIGHT = 14;

// 1, 2 or 5 times a power of ten, so the ticks land on clean numbers.
function niceStep(max: number) {
	const raw = max / TICK_TARGET;
	const power = 10 ** Math.floor(Math.log10(raw));
	const multiple = [1, 2, 5, 10].find((m) => m * power >= raw) ?? 10;
	return multiple * power;
}

// A column with a rounded data end and a square base.
function columnPath(x: number, y: number, w: number, h: number) {
	const r = Math.min(RADIUS, h, w / 2);
	return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// "BlazeDiff (ssim-native)" breaks before the parenthesis to fit narrow bands.
function labelLines(bar: ColumnBar) {
	const lines = bar.name.split(/ (?=\()/);
	return bar.version ? [...lines, bar.version] : lines;
}

function useWidth() {
	const ref = useRef<HTMLDivElement | null>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver(([entry]) =>
			setWidth(entry.contentRect.width),
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}

export default function ColumnChart({ label, unit, bars }: ColumnChartProps) {
	const [ref, width] = useWidth();
	const [active, setActive] = useState<number | null>(null);

	const max = Math.max(...bars.map((b) => b.value));
	const step = niceStep(max);
	const top = Math.ceil(max / step) * step;
	const ticks = Array.from(
		{ length: Math.round(top / step) + 1 },
		(_, i) => i * step,
	);
	const plotWidth = Math.max(0, width - MARGIN.left - MARGIN.right);
	const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
	const band = plotWidth / bars.length;
	const baseline = MARGIN.top + plotHeight;
	const y = (value: number) => baseline - (value / top) * plotHeight;
	const centerX = (i: number) => MARGIN.left + band * (i + 0.5);
	const activeBar = active === null ? null : bars[active];

	return (
		<div ref={ref} className="relative w-full" style={{ height: HEIGHT }}>
			{width > 0 && (
				<svg
					width={width}
					height={HEIGHT}
					role="img"
					aria-label={label}
					className="block font-mono text-[11px]"
				>
					{ticks.map((tick) => (
						<g key={tick}>
							<line
								x1={MARGIN.left}
								x2={width - MARGIN.right}
								y1={y(tick)}
								y2={y(tick)}
								className="stroke-line"
								strokeWidth={1}
								shapeRendering="crispEdges"
							/>
							<text
								x={MARGIN.left - 8}
								y={y(tick)}
								dy="0.32em"
								textAnchor="end"
								className="fill-muted tabular-nums"
							>
								{formatTick(tick, unit)}
							</text>
						</g>
					))}
					{bars.map((bar, i) => {
						const x = centerX(i) - BAR_WIDTH / 2;
						const barTop = y(bar.value);
						return (
							<g key={bar.id}>
								<path
									d={columnPath(x, barTop, BAR_WIDTH, baseline - barTop)}
									className={`${bar.highlight ? "fill-accent" : "fill-muted/50"} transition-opacity ${
										active === i ? "opacity-80" : ""
									}`}
								/>
								<text
									x={centerX(i)}
									y={barTop - 8}
									textAnchor="middle"
									className="fill-fg tabular-nums"
								>
									{formatValue(bar.value, unit)}
								</text>
								{labelLines(bar).map((line, li) => (
									<text
										key={line}
										x={centerX(i)}
										y={baseline + 18 + li * LINE_HEIGHT}
										textAnchor="middle"
										className={li === 0 ? "fill-fg" : "fill-muted"}
									>
										{line}
									</text>
								))}
								{/* biome-ignore lint/a11y/noStaticElementInteractions: the band is the hover target for the tooltip; keyboard focus shows the same readout */}
								<rect
									x={centerX(i) - band / 2}
									y={MARGIN.top}
									width={band}
									height={plotHeight + MARGIN.bottom}
									fill="transparent"
									tabIndex={0}
									aria-label={`${bar.name}: ${formatValue(bar.value, unit)}, ${bar.comparison}`}
									className="outline-none cursor-default"
									onPointerEnter={() => setActive(i)}
									onPointerLeave={() => setActive(null)}
									onFocus={() => setActive(i)}
									onBlur={() => setActive(null)}
								/>
							</g>
						);
					})}
				</svg>
			)}
			{activeBar && active !== null && (
				<div
					className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full border border-line bg-terminal px-3 py-2 font-mono text-[12px] whitespace-nowrap"
					style={{ left: centerX(active), top: y(activeBar.value) - 24 }}
				>
					<div className="text-fg font-semibold tabular-nums">
						{formatValue(activeBar.value, unit)}
					</div>
					<div className="text-muted">
						{activeBar.name}
						{activeBar.version ? ` ${activeBar.version}` : ""}
					</div>
					<div className="text-muted">{activeBar.comparison}</div>
				</div>
			)}
		</div>
	);
}
