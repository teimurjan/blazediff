"use client";

import { Fragment, type ReactNode } from "react";
import RegionTile, { type Bbox, padBbox } from "./region-tile";
import type { CyclingRegion } from "./use-report-cycling";
import { useTimeline } from "./use-timeline";

interface AgentTerminalDemoProps {
	/** Every route the check captures; `entryId` must be one of them. */
	routes: string[];
	/** The one route the heuristic can't decide on. */
	entryId: string;
	fixtureBaseline: string;
	fixtureActual: string;
	imageWidth: number;
	imageHeight: number;
	/** Regions the agent reads as [baseline | actual] tile pairs. */
	regions: CyclingRegion[];
	/** The agent's one-line reading of those tiles. */
	judgment: string;
}

const PROMPT = "/blazediff --cwd apps/website";

const STEP = {
	CHECK: 1,
	CHECK_DONE: 2,
	READ: 3,
	READ_DONE: 4,
	JUDGE: 5,
	WRITE: 6,
	ASK: 7,
} as const;

// ms after loop start at which each STEP becomes visible (index = step - 1).
const CUES = [1200, 3100, 3900, 5100, 6100, 7300, 8500];
const LOOP_MS = 14000;
const ROUTE_FILL_STAGGER_MS = 70;
const TILE_PAD_PX = 18;

export default function AgentTerminalDemo({
	routes,
	entryId,
	fixtureBaseline,
	fixtureActual,
	imageWidth,
	imageHeight,
	regions,
	judgment,
}: AgentTerminalDemoProps) {
	const { step, cycle } = useTimeline(CUES, LOOP_MS);

	const tiles = regions.map((region) => ({
		region,
		crop: padBbox(region.bbox, TILE_PAD_PX, imageWidth, imageHeight),
	}));
	const tilePixels = tiles.reduce(
		(sum, { crop }) => sum + crop.width * crop.height,
		0,
	);
	const pixelSavings = Math.round((imageWidth * imageHeight) / tilePixels);

	return (
		<div
			data-blazediff-agent-mask
			aria-hidden="true"
			className="p-4 bg-canvas font-mono text-[12px] leading-[1.55] text-fg flex flex-col gap-3"
		>
			<p>
				<PromptMark />{" "}
				<span
					key={cycle}
					className="typing inline-block"
					style={{ animationTimingFunction: `steps(${PROMPT.length}, end)` }}
				>
					{PROMPT}
				</span>
			</p>

			<Line visible={step >= STEP.CHECK}>
				<ToolCall name="Bash" args="blazediff-agent check --judge host" />
				<RouteStrip
					routes={routes}
					filled={step >= STEP.CHECK}
					pendingId={step >= STEP.WRITE ? undefined : entryId}
				/>
				<Line visible={step >= STEP.CHECK_DONE}>
					<ToolResult>
						<span className="text-fg">{routes.length - 1} passed</span> ·{" "}
						<span className="text-magenta">1 pending judgment</span> · {entryId}
					</ToolResult>
				</Line>
			</Line>

			<Line visible={step >= STEP.READ}>
				<ToolCall
					name="Read"
					args={`.blazediff/judgments/${entryId}/regions.png`}
				/>
				<div className="my-2 ml-4 grid grid-cols-2 gap-px bg-line border border-line">
					<TileHeader>BASELINE</TileHeader>
					<TileHeader>ACTUAL</TileHeader>
					{tiles.map(({ region, crop }) => (
						<Fragment key={bboxKey(region.bbox)}>
							<RegionTile
								src={fixtureBaseline}
								alt={`${region.changeType} baseline`}
								crop={crop}
								bbox={region.bbox}
								imageWidth={imageWidth}
							/>
							<RegionTile
								src={fixtureActual}
								alt={`${region.changeType} actual`}
								crop={crop}
								bbox={region.bbox}
								imageWidth={imageWidth}
								label={region.changeType}
							/>
						</Fragment>
					))}
				</div>
				<Line visible={step >= STEP.READ_DONE}>
					<ToolResult>
						{tiles.length} region pairs · {pixelSavings}x fewer pixels than the
						full pages
					</ToolResult>
				</Line>
			</Line>

			<Line visible={step >= STEP.JUDGE}>
				<AgentSays>{judgment}</AgentSays>
			</Line>

			<Line visible={step >= STEP.WRITE}>
				<ToolCall
					name="Write"
					args={`.blazediff/judgments/${entryId}/verdict.json`}
				/>
				<ToolResult>
					verdict <span className="text-accent">intentional-likely</span> ·
					confidence 0.9
				</ToolResult>
			</Line>

			<Line visible={step >= STEP.ASK}>
				<AgentSays>
					{routes.length}/{routes.length} resolved. Rewrite the baseline for{" "}
					{entryId}?
				</AgentSays>
				<p className="mt-3">
					<PromptMark />{" "}
					<span className="inline-block w-2 h-[14px] align-middle bg-accent animate-pulse" />
				</p>
			</Line>
		</div>
	);
}

const bboxKey = (bbox: Bbox) =>
	`${bbox.x}-${bbox.y}-${bbox.width}-${bbox.height}`;

function Line({
	visible,
	children,
}: {
	visible: boolean;
	children: ReactNode;
}) {
	return (
		<div
			className={`transition-all duration-500 ease-out motion-reduce:transition-none ${
				visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
			}`}
		>
			{children}
		</div>
	);
}

function PromptMark() {
	return <span className="text-accent">❯</span>;
}

function ToolCall({ name, args }: { name: string; args: string }) {
	return (
		<p>
			<span className="text-accent">⏺</span> {name}(
			<span className="text-muted break-all">{args}</span>)
		</p>
	);
}

function ToolResult({ children }: { children: ReactNode }) {
	return <p className="pl-4 text-muted">⎿ {children}</p>;
}

function AgentSays({ children }: { children: ReactNode }) {
	return (
		<p>
			<span className="text-accent">⏺</span> {children}
		</p>
	);
}

function TileHeader({ children }: { children: ReactNode }) {
	return (
		<span className="bg-canvas px-2 py-1 text-[9px] tracking-widest text-muted">
			{children}
		</span>
	);
}

interface RouteStripProps {
	routes: string[];
	filled: boolean;
	pendingId?: string;
}

function RouteStrip({ routes, filled, pendingId }: RouteStripProps) {
	return (
		<div
			className="my-2 ml-4 grid gap-[3px]"
			style={{
				gridTemplateColumns: `repeat(${routes.length}, minmax(0, 1fr))`,
			}}
		>
			{routes.map((id, i) => {
				const color = !filled
					? "bg-line"
					: id === pendingId
						? "bg-magenta shadow-[0_0_8px_#ff2e8b]"
						: "bg-accent";
				return (
					<span
						key={id}
						title={id}
						className={`h-2.5 transition-colors duration-300 ${color}`}
						style={{
							// Stagger the initial fill only; resets and the pending flip are instant.
							transitionDelay:
								filled && pendingId ? `${i * ROUTE_FILL_STAGGER_MS}ms` : "0ms",
						}}
					/>
				);
			})}
		</div>
	);
}
