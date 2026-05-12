"use client";

import RegionImage from "./region-image";
import { type CyclingRegion, useReportCycling } from "./use-report-cycling";

interface ReportCyclingProps {
	id: string;
	fixtureBaseline: string;
	fixtureCurrent: string;
	imageWidth: number;
	imageHeight: number;
	regions: CyclingRegion[];
	diffPercentage: number;
	severity: string;
}

const CHANGE_TYPE_TEXT: Record<string, string> = {
	addition: "text-emerald-400",
	deletion: "text-rose-400",
	"content-change": "text-accent",
	"color-change": "text-amber-400",
	shift: "text-cyan-400",
	"rendering-noise": "text-muted",
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
	const { activeIndex, active } = useReportCycling(regions);
	if (!active) return null;
	const accent = CHANGE_TYPE_TEXT[active.changeType] ?? "text-magenta";

	return (
		<div
			data-blazediff-agent-mask
			className="border border-magenta/40 bg-surface p-4 flex flex-col gap-4"
		>
			<div className="flex flex-wrap items-center gap-3">
				<span className="font-mono text-[13px] text-fg">{id}</span>
				<span className="font-mono text-[11px] tracking-widest text-magenta uppercase border border-magenta/50 px-2 py-0.5">
					FAIL
				</span>
				<span className="font-mono text-[11px] tracking-widest text-muted uppercase ml-auto">
					{regions.length} regions · {diffPercentage.toFixed(2)}% · {severity}
				</span>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_minmax(14rem,1fr)] gap-4">
				<RegionImage
					label="BASELINE"
					src={fixtureBaseline}
					alt={`${id} baseline`}
					imageWidth={imageWidth}
					imageHeight={imageHeight}
					regions={regions}
					activeIndex={activeIndex}
				/>
				<RegionImage
					label="CURRENT"
					src={fixtureCurrent}
					alt={`${id} current`}
					imageWidth={imageWidth}
					imageHeight={imageHeight}
					regions={regions}
					activeIndex={activeIndex}
				/>

				<dl className="grid grid-cols-[7rem_1fr] gap-y-1 self-start font-mono text-[12px]">
					<dt className="text-muted uppercase tracking-widest">changeType</dt>
					<dd className={accent}>{active.changeType}</dd>
					<dt className="text-muted uppercase tracking-widest">position</dt>
					<dd className="text-fg">{active.position}</dd>
					<dt className="text-muted uppercase tracking-widest">shape</dt>
					<dd className="text-fg">{active.shape}</dd>
					<dt className="text-muted uppercase tracking-widest">bbox</dt>
					<dd className="text-fg">
						x{active.bbox.x} y{active.bbox.y} · {active.bbox.width}×
						{active.bbox.height}
					</dd>
					<dt className="text-muted uppercase tracking-widest">pixels</dt>
					<dd className="text-fg">
						{active.pixelCount.toLocaleString()} ({active.percentage.toFixed(2)}
						%)
					</dd>
					<dt className="text-muted uppercase tracking-widest">region</dt>
					<dd className="text-fg">
						{activeIndex + 1} / {regions.length}
					</dd>
				</dl>
			</div>
		</div>
	);
}
