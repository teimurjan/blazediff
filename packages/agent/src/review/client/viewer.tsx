// Diff viewer: 4 view modes + region overlays + pixel-zoom inset.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewEntry, ReviewRegion } from "../types";

export type ViewMode = "compare" | "slider" | "flip" | "diff";

export function imgUrl(id: string, kind: "baseline" | "actual"): string {
	return `/api/image/${kind}/${encodeURIComponent(id)}`;
}

// ─── Region overlay rectangle (absolute, % positioned) ──────────────────────
function RegionRect({
	region,
	naturalW,
	naturalH,
	selected,
	masked,
	label,
	onClick,
}: {
	region: ReviewRegion;
	naturalW: number;
	naturalH: number;
	selected: boolean;
	masked: boolean;
	label: string;
	onClick: (e: React.MouseEvent) => void;
}) {
	const s = {
		left: `${(region.bbox.x / naturalW) * 100}%`,
		top: `${(region.bbox.y / naturalH) * 100}%`,
		width: `${(region.bbox.w / naturalW) * 100}%`,
		height: `${(region.bbox.h / naturalH) * 100}%`,
	};
	const cls = ["reg"];
	if (selected) cls.push("selected");
	if (masked && selected) cls.push("mask-cut");
	return (
		<button
			type="button"
			className={cls.join(" ")}
			style={s}
			data-label={label}
			onClick={onClick}
			aria-label={`Region ${label} at ${region.bbox.x},${region.bbox.y}`}
		/>
	);
}

function Regions({
	entry,
	selectedRegionId,
	masked,
	onSelectRegion,
	stopProp = false,
}: {
	entry: ReviewEntry;
	selectedRegionId: number | null;
	masked: boolean;
	onSelectRegion: (id: number) => void;
	stopProp?: boolean;
}) {
	return (
		<>
			{entry.regions.map((r, i) => (
				<RegionRect
					key={r.id}
					region={r}
					naturalW={entry.width}
					naturalH={entry.height}
					selected={selectedRegionId === r.id}
					masked={masked}
					label={`#${i + 1}`}
					onClick={(e) => {
						if (stopProp) e.stopPropagation();
						onSelectRegion(r.id);
					}}
				/>
			))}
		</>
	);
}

// ─── Compare mode: side-by-side panes ────────────────────────────────────────
function ComparePane({
	entry,
	kind,
	selectedRegionId,
	masked,
	onSelectRegion,
	baseline,
	candidate,
}: {
	entry: ReviewEntry;
	kind: "before" | "after";
	selectedRegionId: number | null;
	masked: boolean;
	onSelectRegion: (id: number) => void;
	baseline: string;
	candidate: string;
}) {
	return (
		<div className="pane">
			<div className="pane-label">
				<span>{kind === "before" ? "Baseline" : "Candidate"}</span>
				<span className="commit">
					{kind === "before" ? baseline : candidate}
				</span>
			</div>
			<div className="stage">
				<img
					src={imgUrl(entry.id, kind === "before" ? "baseline" : "actual")}
					alt={kind}
				/>
				<Regions
					entry={entry}
					selectedRegionId={selectedRegionId}
					masked={masked}
					onSelectRegion={onSelectRegion}
				/>
			</div>
		</div>
	);
}

function CompareView(props: {
	entry: ReviewEntry;
	selectedRegionId: number | null;
	masked: boolean;
	onSelectRegion: (id: number) => void;
	baseline: string;
	candidate: string;
}) {
	return (
		<div className="sbs">
			<ComparePane {...props} kind="before" />
			<ComparePane {...props} kind="after" />
		</div>
	);
}

// ─── Slider mode ──────────────────────────────────────────────────────────────
function SliderView({
	entry,
	selectedRegionId,
	onSelectRegion,
}: {
	entry: ReviewEntry;
	selectedRegionId: number | null;
	onSelectRegion: (id: number) => void;
}) {
	const [pct, setPct] = useState(50);
	const stageRef = useRef<HTMLDivElement>(null);
	const dragging = useRef(false);

	const onMove = useCallback((clientX: number) => {
		const el = stageRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const p = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
		setPct(p);
	}, []);

	useEffect(() => {
		const mm = (e: MouseEvent) => {
			if (dragging.current) onMove(e.clientX);
		};
		const mu = () => {
			dragging.current = false;
			document.body.style.cursor = "";
		};
		window.addEventListener("mousemove", mm);
		window.addEventListener("mouseup", mu);
		return () => {
			window.removeEventListener("mousemove", mm);
			window.removeEventListener("mouseup", mu);
		};
	}, [onMove]);

	const startDrag = (e: React.MouseEvent) => {
		dragging.current = true;
		document.body.style.cursor = "ew-resize";
		onMove(e.clientX);
	};

	return (
		<div style={{ width: "min(100%, 1200px)", maxHeight: "100%" }}>
			<div
				className="stage slider-stage"
				ref={stageRef}
				style={{
					aspectRatio: `${entry.width} / ${entry.height}`,
					cursor: "ew-resize",
					userSelect: "none",
				}}
				onMouseDown={startDrag}
			>
				<img src={imgUrl(entry.id, "baseline")} alt="before" />
				<span className="slider-tag before">Baseline</span>
				<div
					className="slider-after"
					style={{ clipPath: `inset(0 0 0 ${pct}%)` }}
				>
					<img src={imgUrl(entry.id, "actual")} alt="after" />
					<span className="slider-tag after">Candidate</span>
				</div>
				<div className="slider-handle" style={{ left: `calc(${pct}% - 1px)` }}>
					<div className="slider-knob" aria-hidden="true">
						⇆
					</div>
				</div>
				<Regions
					entry={entry}
					selectedRegionId={selectedRegionId}
					masked={false}
					onSelectRegion={onSelectRegion}
					stopProp
				/>
			</div>
		</div>
	);
}

// ─── Flip mode (hold space / click to toggle) ─────────────────────────────────
function FlipView({
	entry,
	selectedRegionId,
	onSelectRegion,
	flipShowBefore,
}: {
	entry: ReviewEntry;
	selectedRegionId: number | null;
	onSelectRegion: (id: number) => void;
	flipShowBefore: boolean;
}) {
	return (
		<div style={{ width: "min(100%, 1080px)", maxHeight: "100%" }}>
			<div
				className="stage flip-stage"
				style={{ aspectRatio: `${entry.width} / ${entry.height}` }}
			>
				<img
					src={imgUrl(entry.id, flipShowBefore ? "baseline" : "actual")}
					alt={flipShowBefore ? "before" : "after"}
				/>
				<span className="slider-tag" style={{ left: 10, top: 10 }}>
					{flipShowBefore ? "Baseline" : "Candidate"}
				</span>
				<Regions
					entry={entry}
					selectedRegionId={selectedRegionId}
					masked={false}
					onSelectRegion={onSelectRegion}
				/>
			</div>
		</div>
	);
}

// ─── Diff-only mode (dim base, glow regions) ──────────────────────────────────
function DiffView({
	entry,
	selectedRegionId,
	onSelectRegion,
}: {
	entry: ReviewEntry;
	selectedRegionId: number | null;
	onSelectRegion: (id: number) => void;
}) {
	return (
		<div style={{ width: "min(100%, 1080px)", maxHeight: "100%" }}>
			<div
				className="stage diff-stage"
				style={{ aspectRatio: `${entry.width} / ${entry.height}` }}
			>
				<img src={imgUrl(entry.id, "actual")} alt="after" className="dim" />
				<Regions
					entry={entry}
					selectedRegionId={selectedRegionId}
					masked={false}
					onSelectRegion={onSelectRegion}
				/>
			</div>
		</div>
	);
}

// ─── Zoom inset: selected region pixel-zoomed via canvas ─────────────────────
function ZoomCanvas({
	src,
	region,
	cropX,
	cropY,
	cropW,
	cropH,
}: {
	src: string;
	region: ReviewRegion;
	cropX: number;
	cropY: number;
	cropW: number;
	cropH: number;
}) {
	const ref = useRef<HTMLCanvasElement>(null);
	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.round(rect.width * dpr);
		canvas.height = Math.round(rect.height * dpr);
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.imageSmoothingEnabled = false;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		const img = new Image();
		img.onload = () => {
			ctx.drawImage(
				img,
				cropX,
				cropY,
				cropW,
				cropH,
				0,
				0,
				canvas.width,
				canvas.height,
			);
			const sx = canvas.width / cropW;
			const sy = canvas.height / cropH;
			ctx.strokeStyle =
				getComputedStyle(document.documentElement)
					.getPropertyValue("--diff")
					.trim() || "#f43fb0";
			ctx.lineWidth = Math.max(1.5 * dpr, 1);
			ctx.strokeRect(
				(region.bbox.x - cropX) * sx + ctx.lineWidth / 2,
				(region.bbox.y - cropY) * sy + ctx.lineWidth / 2,
				region.bbox.w * sx - ctx.lineWidth,
				region.bbox.h * sy - ctx.lineWidth,
			);
		};
		img.src = src;
	}, [
		src,
		cropX,
		cropY,
		cropW,
		cropH,
		region.bbox.x,
		region.bbox.y,
		region.bbox.w,
		region.bbox.h,
	]);
	return (
		<canvas
			ref={ref}
			style={{
				width: "100%",
				height: "100%",
				display: "block",
				imageRendering: "pixelated",
			}}
		/>
	);
}

export function ZoomInset({
	entry,
	region,
}: {
	entry: ReviewEntry;
	region: ReviewRegion | undefined;
}) {
	if (!region) return null;
	const padFactor = 0.5;
	let cropW = Math.max(region.bbox.w * (1 + padFactor * 2), 30);
	let cropH = cropW / 2;
	if (cropH < region.bbox.h * 1.4) {
		cropH = region.bbox.h * 1.8;
		cropW = cropH * 2;
	}
	const cropX = region.bbox.x + region.bbox.w / 2 - cropW / 2;
	const cropY = region.bbox.y + region.bbox.h / 2 - cropH / 2;
	const cropProps = { region, cropX, cropY, cropW, cropH };
	return (
		<div className="zoom-inset">
			<div className="zoom-inset-hd">
				<b>Pixel zoom</b>
				<span
					className="mono"
					style={{ color: "var(--text3)", fontSize: 10.5 }}
				>
					{region.bbox.w}×{region.bbox.h}px
				</span>
			</div>
			<div className="zoom-canvases">
				<div className="zoom-cell">
					<div className="zoom-can">
						<ZoomCanvas src={imgUrl(entry.id, "baseline")} {...cropProps} />
					</div>
					<div className="zoom-can-lbl">baseline</div>
				</div>
				<div className="zoom-cell">
					<div className="zoom-can">
						<ZoomCanvas src={imgUrl(entry.id, "actual")} {...cropProps} />
					</div>
					<div className="zoom-can-lbl">candidate</div>
				</div>
			</div>
		</div>
	);
}

// ─── Main Viewer wrapper ──────────────────────────────────────────────────────
export function Viewer({
	entry,
	mode,
	selectedRegionId,
	masked,
	onSelectRegion,
	baseline,
	candidate,
	flipShowBefore,
}: {
	entry: ReviewEntry;
	mode: ViewMode;
	selectedRegionId: number | null;
	masked: boolean;
	onSelectRegion: (id: number) => void;
	baseline: string;
	candidate: string;
	flipShowBefore: boolean;
}) {
	return (
		<div className="viewer">
			<div className="stage-wrap">
				{mode === "compare" && (
					<CompareView
						entry={entry}
						selectedRegionId={selectedRegionId}
						masked={masked}
						onSelectRegion={onSelectRegion}
						baseline={baseline}
						candidate={candidate}
					/>
				)}
				{mode === "slider" && (
					<SliderView
						entry={entry}
						selectedRegionId={selectedRegionId}
						onSelectRegion={onSelectRegion}
					/>
				)}
				{mode === "flip" && (
					<FlipView
						entry={entry}
						selectedRegionId={selectedRegionId}
						onSelectRegion={onSelectRegion}
						flipShowBefore={flipShowBefore}
					/>
				)}
				{mode === "diff" && (
					<DiffView
						entry={entry}
						selectedRegionId={selectedRegionId}
						onSelectRegion={onSelectRegion}
					/>
				)}
			</div>
		</div>
	);
}
