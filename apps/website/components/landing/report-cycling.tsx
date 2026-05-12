"use client";

import { useEffect, useRef, useState } from "react";

interface BBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface Region {
	bbox: BBox;
	pixelCount: number;
	percentage: number;
	position: string;
	shape: string;
	changeType: string;
}

interface ReportCyclingProps {
	id: string;
	fixtureBaseline: string;
	fixtureCurrent: string;
	imageWidth: number;
	imageHeight: number;
	regions: Region[];
	diffPercentage: number;
	severity: string;
}

const CHANGE_TYPE_TEXT: Record<string, string> = {
	addition: "text-emerald-400",
	deletion: "text-rose-400",
	"content-change": "text-[#ff7a1a]",
	"color-change": "text-amber-400",
	shift: "text-cyan-400",
	"rendering-noise": "text-[#7a7585]",
};

export default function ReportCycling({
	id,
	fixtureBaseline,
	fixtureCurrent,
	imageWidth,
	imageHeight,
	regions,
	diffPercentage,
	severity,
}: ReportCyclingProps) {
	const [activeIndex, setActiveIndex] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (regions.length === 0) return;
		intervalRef.current = setInterval(() => {
			setActiveIndex((i) => (i + 1) % regions.length);
		}, 2000);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [regions.length]);

	const active = regions[activeIndex];
	if (!active) return null;
	const accent = CHANGE_TYPE_TEXT[active.changeType] ?? "text-[#ff2e8b]";

	const renderImage = (label: string, src: string, alt: string) => (
		<div
			className="relative border border-[#2a2a38] bg-[#0a0a0f] overflow-hidden"
			style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }}
		>
			<div className="absolute top-2 left-2 bg-[#15151c]/80 px-2 py-0.5 font-[var(--font-jetbrains-mono)] text-[10px] tracking-widest text-[#7a7585] z-30">
				{label}
			</div>
			{/* biome-ignore lint/performance/noImgElement: external static fixture, no Image config */}
			<img
				src={src}
				alt={alt}
				className="w-full h-full object-cover opacity-90"
			/>
			{regions.map((r, i) => {
				const isActive = i === activeIndex;
				return (
					<div
						key={`${r.bbox.x}-${r.bbox.y}-${r.bbox.width}-${r.bbox.height}`}
						className="absolute pointer-events-none transition-all duration-500 ease-out"
						style={{
							left: `${(r.bbox.x / imageWidth) * 100}%`,
							top: `${(r.bbox.y / imageHeight) * 100}%`,
							width: `${(r.bbox.width / imageWidth) * 100}%`,
							height: `${(r.bbox.height / imageHeight) * 100}%`,
							border: isActive
								? "2px solid #ff2e8b"
								: "1px dashed rgba(255, 46, 139, 0.35)",
							background: isActive ? "rgba(255, 46, 139, 0.18)" : "transparent",
							boxShadow: isActive ? "0 0 12px #ff2e8b" : "none",
							zIndex: isActive ? 20 : 10,
						}}
					/>
				);
			})}
		</div>
	);

	return (
		<div
			data-blazediff-mask="report-cycling"
			className="border border-[#ff2e8b]/40 bg-[#15151c] p-4 flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-[var(--font-jetbrains-mono)] text-[13px] text-[#f0ece8]">
					{id}
				</span>
				<span className="font-[var(--font-jetbrains-mono)] text-[11px] tracking-widest text-[#ff2e8b] uppercase border border-[#ff2e8b]/50 px-2 py-0.5">
					FAIL
				</span>
				<span className="font-[var(--font-jetbrains-mono)] text-[11px] tracking-widest text-[#7a7585] uppercase ml-auto">
					{regions.length} regions · {diffPercentage.toFixed(2)}% · {severity}
				</span>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(14rem,1fr)] gap-4">
				{renderImage("BASELINE", fixtureBaseline, `${id} baseline`)}
				{renderImage("CURRENT", fixtureCurrent, `${id} current`)}

				<dl className="grid grid-cols-[7rem_1fr] gap-y-1 self-start font-[var(--font-jetbrains-mono)] text-[12px]">
					<dt className="text-[#7a7585] uppercase tracking-widest">
						changeType
					</dt>
					<dd className={accent}>{active.changeType}</dd>
					<dt className="text-[#7a7585] uppercase tracking-widest">position</dt>
					<dd className="text-[#f0ece8]">{active.position}</dd>
					<dt className="text-[#7a7585] uppercase tracking-widest">shape</dt>
					<dd className="text-[#f0ece8]">{active.shape}</dd>
					<dt className="text-[#7a7585] uppercase tracking-widest">bbox</dt>
					<dd className="text-[#f0ece8]">
						x{active.bbox.x} y{active.bbox.y} · {active.bbox.width}×
						{active.bbox.height}
					</dd>
					<dt className="text-[#7a7585] uppercase tracking-widest">pixels</dt>
					<dd className="text-[#f0ece8]">
						{active.pixelCount.toLocaleString()} ({active.percentage.toFixed(2)}
						%)
					</dd>
					<dt className="text-[#7a7585] uppercase tracking-widest">region</dt>
					<dd className="text-[#f0ece8]">
						{activeIndex + 1} / {regions.length}
					</dd>
				</dl>
			</div>
		</div>
	);
}
