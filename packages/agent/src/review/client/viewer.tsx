// Diff viewer: view modes, synchronized tall-page scrolling, and region previews.
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import type { ReviewEntry, ReviewRegion } from "../types";

export type ViewMode = "compare" | "slider" | "flip" | "diff";

export function imgUrl(id: string, kind: "baseline" | "actual"): string {
	return `/api/image/${kind}/${encodeURIComponent(id)}`;
}

function updateScrollState(scroller: HTMLDivElement): void {
	const viewport = scroller.parentElement;
	if (!viewport) return;
	const maxScroll = scroller.scrollHeight - scroller.clientHeight;
	viewport.classList.toggle("can-scroll-up", scroller.scrollTop > 1);
	viewport.classList.toggle(
		"can-scroll-down",
		maxScroll > 1 && scroller.scrollTop < maxScroll - 1,
	);
}

function ScrollViewport({
	children,
	className = "",
	scrollRef,
	onScroll,
}: {
	children: ReactNode;
	className?: string;
	scrollRef?: (node: HTMLDivElement | null) => void;
	onScroll?: (node: HTMLDivElement) => void;
}) {
	const localRef = useRef<HTMLDivElement | null>(null);
	const setRef = useCallback(
		(node: HTMLDivElement | null) => {
			localRef.current = node;
			scrollRef?.(node);
		},
		[scrollRef],
	);

	useEffect(() => {
		const scroller = localRef.current;
		if (!scroller) return;
		scroller.scrollTop = 0;
		updateScrollState(scroller);
		const image = scroller.querySelector("img");
		const refresh = () => updateScrollState(scroller);
		image?.addEventListener("load", refresh);
		const observer = new ResizeObserver(refresh);
		observer.observe(scroller);
		if (scroller.firstElementChild)
			observer.observe(scroller.firstElementChild);
		return () => {
			image?.removeEventListener("load", refresh);
			observer.disconnect();
		};
	}, []);

	return (
		<div className={`stage-viewport ${className}`}>
			<div
				className="stage-scroll"
				ref={setRef}
				onScroll={(event) => {
					updateScrollState(event.currentTarget);
					onScroll?.(event.currentTarget);
				}}
			>
				{children}
			</div>
			<div className="scroll-cue scroll-cue-top" aria-hidden="true">
				↑
			</div>
			<div className="scroll-cue scroll-cue-bottom" aria-hidden="true">
				↓
			</div>
		</div>
	);
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
	onPreview,
	onPreviewEnd,
}: {
	region: ReviewRegion;
	naturalW: number;
	naturalH: number;
	selected: boolean;
	masked: boolean;
	label: string;
	onClick: (e: React.MouseEvent) => void;
	onPreview: (e: React.MouseEvent<HTMLButtonElement>) => void;
	onPreviewEnd: () => void;
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
			onMouseEnter={onPreview}
			onMouseMove={onPreview}
			onMouseLeave={onPreviewEnd}
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
	const [magnifier, setMagnifier] = useState<{
		focusX: number;
		focusY: number;
		anchorX: number;
		anchorY: number;
	} | null>(null);

	const updateMagnifier = (event: React.MouseEvent<HTMLButtonElement>) => {
		const stage = event.currentTarget.parentElement;
		if (!stage) return;
		const rect = stage.getBoundingClientRect();
		setMagnifier({
			focusX: Math.max(
				0,
				Math.min(1, (event.clientX - rect.left) / rect.width),
			),
			focusY: Math.max(
				0,
				Math.min(1, (event.clientY - rect.top) / rect.height),
			),
			anchorX: event.clientX,
			anchorY: event.clientY,
		});
	};

	return (
		<>
			{entry.regions.map((region, index) => (
				<RegionRect
					key={region.id}
					region={region}
					naturalW={entry.width}
					naturalH={entry.height}
					selected={selectedRegionId === region.id}
					masked={masked}
					label={`#${index + 1}`}
					onClick={(event) => {
						if (stopProp) event.stopPropagation();
						onSelectRegion(region.id);
					}}
					onPreview={updateMagnifier}
					onPreviewEnd={() => setMagnifier(null)}
				/>
			))}
			{magnifier && (
				<ScreenshotMagnifier
					entry={entry}
					focusX={magnifier.focusX}
					focusY={magnifier.focusY}
					anchorX={magnifier.anchorX}
					anchorY={magnifier.anchorY}
				/>
			)}
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
	scrollRef,
	onScroll,
}: {
	entry: ReviewEntry;
	kind: "before" | "after";
	selectedRegionId: number | null;
	masked: boolean;
	onSelectRegion: (id: number) => void;
	baseline: string;
	candidate: string;
	scrollRef: (node: HTMLDivElement | null) => void;
	onScroll: (node: HTMLDivElement) => void;
}) {
	const size = kind === "before" ? entry.baselineSize : entry.candidateSize;
	return (
		<div className="pane">
			<div className="pane-label">
				<span className="pane-title">
					{kind === "before" ? "Baseline" : "Candidate"}
					{size && (
						<span className="pane-dim">
							{size.width}×{size.height}
						</span>
					)}
				</span>
				<span className="commit">
					{kind === "before" ? baseline : candidate}
				</span>
			</div>
			<ScrollViewport
				key={`${entry.id}-${kind}`}
				scrollRef={scrollRef}
				onScroll={onScroll}
			>
				<div className="stage natural-stage">
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
			</ScrollViewport>
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
	const scrollers = useRef<[HTMLDivElement | null, HTMLDivElement | null]>([
		null,
		null,
	]);
	const syncing = useRef(false);

	const syncScroll = (sourceIndex: number, source: HTMLDivElement) => {
		if (syncing.current) return;
		const target = scrollers.current[sourceIndex === 0 ? 1 : 0];
		if (!target) return;
		const sourceMax = source.scrollHeight - source.clientHeight;
		const targetMax = target.scrollHeight - target.clientHeight;
		syncing.current = true;
		target.scrollTop =
			sourceMax > 0 ? (source.scrollTop / sourceMax) * targetMax : 0;
		updateScrollState(target);
		requestAnimationFrame(() => {
			syncing.current = false;
		});
	};

	return (
		<div className="sbs">
			<ComparePane
				{...props}
				kind="before"
				scrollRef={(node) => {
					scrollers.current[0] = node;
				}}
				onScroll={(node) => syncScroll(0, node)}
			/>
			<ComparePane
				{...props}
				kind="after"
				scrollRef={(node) => {
					scrollers.current[1] = node;
				}}
				onScroll={(node) => syncScroll(1, node)}
			/>
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
		<ScrollViewport
			className="single-stage-viewport"
			key={`${entry.id}-slider`}
		>
			<div
				className="stage slider-stage natural-stage"
				ref={stageRef}
				style={{
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
		</ScrollViewport>
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
		<ScrollViewport className="single-stage-viewport" key={`${entry.id}-flip`}>
			<div className="stage flip-stage natural-stage">
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
		</ScrollViewport>
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
		<ScrollViewport className="single-stage-viewport" key={`${entry.id}-diff`}>
			<div className="stage diff-stage natural-stage">
				<img src={imgUrl(entry.id, "actual")} alt="after" className="dim" />
				<Regions
					entry={entry}
					selectedRegionId={selectedRegionId}
					masked={false}
					onSelectRegion={onSelectRegion}
				/>
			</div>
		</ScrollViewport>
	);
}

const MAGNIFICATION = 6;

function MagnifierCanvas({
	src,
	focusX,
	focusY,
}: {
	src: string;
	focusX: number;
	focusY: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const imageRef = useRef<HTMLImageElement | null>(null);
	const [loadedSrc, setLoadedSrc] = useState("");

	useEffect(() => {
		const image = new Image();
		imageRef.current = null;
		image.onload = () => {
			imageRef.current = image;
			setLoadedSrc(src);
		};
		image.src = src;
		return () => {
			image.onload = null;
		};
	}, [src]);

	useEffect(() => {
		const canvas = canvasRef.current;
		const image = imageRef.current;
		if (!canvas || !image || loadedSrc !== src) return;
		const rect = canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const bitmapWidth = Math.round(rect.width * dpr);
		const bitmapHeight = Math.round(rect.height * dpr);
		if (canvas.width !== bitmapWidth) canvas.width = bitmapWidth;
		if (canvas.height !== bitmapHeight) canvas.height = bitmapHeight;
		const context = canvas.getContext("2d");
		if (!context) return;

		const cropW = Math.min(rect.width / MAGNIFICATION, image.naturalWidth);
		const cropH = Math.min(rect.height / MAGNIFICATION, image.naturalHeight);
		const centerX = focusX * image.naturalWidth;
		const centerY = focusY * image.naturalHeight;
		const cropX = Math.max(
			0,
			Math.min(centerX - cropW / 2, image.naturalWidth - cropW),
		);
		const cropY = Math.max(
			0,
			Math.min(centerY - cropH / 2, image.naturalHeight - cropH),
		);

		context.imageSmoothingEnabled = false;
		context.clearRect(0, 0, canvas.width, canvas.height);
		context.drawImage(
			image,
			cropX,
			cropY,
			cropW,
			cropH,
			0,
			0,
			canvas.width,
			canvas.height,
		);

		const crosshairSize = 8 * dpr;
		const centerCanvasX = canvas.width / 2;
		const centerCanvasY = canvas.height / 2;
		context.strokeStyle =
			getComputedStyle(document.documentElement)
				.getPropertyValue("--diff")
				.trim() || "#f43fb0";
		context.lineWidth = Math.max(dpr, 1);
		context.beginPath();
		context.moveTo(centerCanvasX - crosshairSize, centerCanvasY);
		context.lineTo(centerCanvasX + crosshairSize, centerCanvasY);
		context.moveTo(centerCanvasX, centerCanvasY - crosshairSize);
		context.lineTo(centerCanvasX, centerCanvasY + crosshairSize);
		context.stroke();
	}, [focusX, focusY, loadedSrc, src]);

	return (
		<canvas
			ref={canvasRef}
			style={{
				width: "100%",
				height: "100%",
				display: "block",
				imageRendering: "pixelated",
			}}
		/>
	);
}

function ScreenshotMagnifier({
	entry,
	focusX,
	focusY,
	anchorX,
	anchorY,
}: {
	entry: ReviewEntry;
	focusX: number;
	focusY: number;
	anchorX: number;
	anchorY: number;
}) {
	const width = Math.min(960, window.innerWidth - 24);
	const left = Math.max(
		12,
		Math.min(
			anchorX + width + 26 <= window.innerWidth
				? anchorX + 14
				: anchorX - width - 14,
			window.innerWidth - width - 12,
		),
	);
	const estimatedHeight = width / 3 + 64;
	const top = Math.max(
		12,
		Math.min(anchorY - 48, window.innerHeight - estimatedHeight - 12),
	);
	const imageX = Math.round(focusX * entry.width);
	const imageY = Math.round(focusY * entry.height);

	return createPortal(
		<div
			className="pixel-popover pixel-magnifier"
			style={{ left, top, width }}
			role="tooltip"
		>
			<div className="zoom-inset">
				<div className="zoom-inset-hd">
					<b>Magnifier</b>
					<span className="mono">
						{MAGNIFICATION}× · {imageX},{imageY}
					</span>
				</div>
				<div className="zoom-canvases magnifier-canvases">
					<div className="zoom-cell">
						<div className="zoom-can magnifier-can">
							<MagnifierCanvas
								src={imgUrl(entry.id, "baseline")}
								focusX={focusX}
								focusY={focusY}
							/>
						</div>
						<div className="zoom-can-lbl">baseline</div>
					</div>
					<div className="zoom-cell">
						<div className="zoom-can magnifier-can">
							<MagnifierCanvas
								src={imgUrl(entry.id, "actual")}
								focusX={focusX}
								focusY={focusY}
							/>
						</div>
						<div className="zoom-can-lbl">candidate</div>
					</div>
				</div>
			</div>
		</div>,
		document.body,
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

function ZoomInset({
	entry,
	region,
}: {
	entry: ReviewEntry;
	region: ReviewRegion;
}) {
	const previewAspectRatio = 3 / 2;
	const paddingScale = 1.5;
	let cropW = Math.max(region.bbox.w * paddingScale, 30);
	let cropH = cropW / previewAspectRatio;
	if (cropH < region.bbox.h * paddingScale) {
		cropH = region.bbox.h * paddingScale;
		cropW = cropH * previewAspectRatio;
	}
	const cropX = region.bbox.x + region.bbox.w / 2 - cropW / 2;
	const cropY = region.bbox.y + region.bbox.h / 2 - cropH / 2;
	const cropProps = { region, cropX, cropY, cropW, cropH };
	const accepted = entry.status === "approved";
	return (
		<div className="zoom-inset">
			<div className="zoom-inset-hd">
				<b>Pixel zoom</b>
				<span className="mono">
					{region.bbox.w}×{region.bbox.h}px
				</span>
			</div>
			<div className={`zoom-canvases ${accepted ? "single" : ""}`}>
				<div className="zoom-cell">
					<div className="zoom-can">
						<ZoomCanvas src={imgUrl(entry.id, "baseline")} {...cropProps} />
					</div>
					<div className="zoom-can-lbl">
						{accepted ? "accepted baseline" : "baseline"}
					</div>
				</div>
				{!accepted && (
					<div className="zoom-cell">
						<div className="zoom-can">
							<ZoomCanvas src={imgUrl(entry.id, "actual")} {...cropProps} />
						</div>
						<div className="zoom-can-lbl">candidate</div>
					</div>
				)}
			</div>
		</div>
	);
}

export function PixelZoomPopover({
	entry,
	region,
	anchorX,
	anchorY,
}: {
	entry: ReviewEntry;
	region: ReviewRegion;
	anchorX: number;
	anchorY: number;
}) {
	const width = Math.min(960, window.innerWidth - 24);
	const left = Math.max(
		12,
		Math.min(
			anchorX + width + 26 <= window.innerWidth
				? anchorX + 14
				: anchorX - width - 14,
			window.innerWidth - width - 12,
		),
	);
	const estimatedHeight = width / 3 + 64;
	const top = Math.max(
		12,
		Math.min(anchorY - 48, window.innerHeight - estimatedHeight - 12),
	);
	return createPortal(
		<div className="pixel-popover" style={{ left, top, width }} role="tooltip">
			<ZoomInset entry={entry} region={region} />
		</div>,
		document.body,
	);
}

function AcceptedView({
	entry,
	baseline,
}: {
	entry: ReviewEntry;
	baseline: string;
}) {
	return (
		<div className="accepted-view">
			<div className="pane-label">
				<span className="pane-title">
					Accepted baseline
					{entry.baselineSize && (
						<span className="pane-dim">
							{entry.baselineSize.width}×{entry.baselineSize.height}
						</span>
					)}
				</span>
				<span className="commit">{baseline}</span>
			</div>
			<ScrollViewport
				className="single-stage-viewport"
				key={`${entry.id}-accepted`}
			>
				<div className="stage natural-stage">
					<img src={imgUrl(entry.id, "baseline")} alt="accepted baseline" />
				</div>
			</ScrollViewport>
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
				{entry.status === "approved" && (
					<AcceptedView entry={entry} baseline={baseline} />
				)}
				{entry.status !== "approved" && mode === "compare" && (
					<CompareView
						entry={entry}
						selectedRegionId={selectedRegionId}
						masked={masked}
						onSelectRegion={onSelectRegion}
						baseline={baseline}
						candidate={candidate}
					/>
				)}
				{entry.status !== "approved" && mode === "slider" && (
					<SliderView
						entry={entry}
						selectedRegionId={selectedRegionId}
						onSelectRegion={onSelectRegion}
					/>
				)}
				{entry.status !== "approved" && mode === "flip" && (
					<FlipView
						entry={entry}
						selectedRegionId={selectedRegionId}
						onSelectRegion={onSelectRegion}
						flipShowBefore={flipShowBefore}
					/>
				)}
				{entry.status !== "approved" && mode === "diff" && (
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
