"use client";

import { Fragment } from "react";
import RegionImage from "./region-image";
import { type CyclingRegion, useReportCycling } from "./use-report-cycling";

interface HeroInterpretProps {
	fixtureBaseline: string;
	fixtureCurrent: string;
	imageWidth: number;
	imageHeight: number;
	diffPercentage: number;
	severity: string;
	regions: CyclingRegion[];
}

// Each image takes this share of the stack's width; the top one is lifted by
// this share of its own height. The rest of the frame is the peek of the card
// underneath.
const IMAGE_WIDTH_SHARE = 0.88;
const LIFT_SHARE = 0.18;

const CHANGE_TYPES: { type: string; singular: string; plural: string }[] = [
	{ type: "content-change", singular: "change", plural: "changes" },
	{ type: "addition", singular: "addition", plural: "additions" },
	{ type: "deletion", singular: "removal", plural: "removals" },
	{ type: "shift", singular: "shift", plural: "shifts" },
];

function countByChangeType(regions: CyclingRegion[]) {
	const counts = new Map<string, number>();
	for (const region of regions) {
		counts.set(region.changeType, (counts.get(region.changeType) ?? 0) + 1);
	}
	return CHANGE_TYPES.flatMap(({ type, singular, plural }) => {
		const count = counts.get(type);
		if (!count) return [];
		return [{ type, count, label: count === 1 ? singular : plural }];
	});
}

export default function HeroInterpret({
	fixtureBaseline,
	fixtureCurrent,
	imageWidth,
	imageHeight,
	diffPercentage,
	severity,
	regions,
}: HeroInterpretProps) {
	const { activeIndex, active } = useReportCycling(regions);
	if (!active) return null;

	const verdict = countByChangeType(regions);
	const stackAspect =
		imageWidth / imageHeight / ((1 + LIFT_SHARE) * IMAGE_WIDTH_SHARE);
	const imageWidthStyle = { width: `${IMAGE_WIDTH_SHARE * 100}%` };

	return (
		<div
			data-blazediff-agent-mask
			className="flex flex-col w-full max-w-[520px] mx-auto"
		>
			<p className="font-mono text-[12px] md:text-[13px] text-muted mb-6">
				<span className="text-accent">$</span> blazediff a.png b.png --interpret
			</p>

			<div
				className="relative w-full"
				style={{ aspectRatio: `${stackAspect}` }}
			>
				<div className="absolute left-0 bottom-0 z-0" style={imageWidthStyle}>
					<RegionImage
						label="BASELINE"
						labelPosition="bottom"
						src={fixtureBaseline}
						alt="baseline"
						imageWidth={imageWidth}
						imageHeight={imageHeight}
						regions={regions}
						activeIndex={activeIndex}
					/>
				</div>
				<div
					className="absolute right-0 top-0 z-10 shadow-[0_24px_60px_-12px_rgba(0,0,0,0.85)]"
					style={imageWidthStyle}
				>
					<RegionImage
						label="CURRENT"
						src={fixtureCurrent}
						alt="current"
						imageWidth={imageWidth}
						imageHeight={imageHeight}
						regions={regions}
						activeIndex={activeIndex}
					/>
				</div>
			</div>

			<div className="flex justify-center text-accent py-5" aria-hidden="true">
				<svg width="14" height="42" viewBox="0 0 14 42" fill="none">
					<title>produces</title>
					<path
						d="M7 0v34M1.5 28.5 7 35l5.5-6.5"
						stroke="currentColor"
						strokeWidth="1.5"
					/>
				</svg>
			</div>

			<div className="flex flex-col items-center gap-2 text-center">
				<p className="font-mono text-[15px] md:text-[17px] text-fg">
					{verdict.map((entry, i) => (
						<Fragment key={entry.type}>
							{i > 0 && <span className="text-muted">, </span>}
							<span
								className={
									entry.type === active.changeType ? "text-magenta" : undefined
								}
							>
								{entry.count} {entry.label}
							</span>
						</Fragment>
					))}
				</p>
				<p className="font-mono text-[11px] tracking-widest uppercase text-muted">
					{regions.length} regions · {diffPercentage.toFixed(2)}% of pixels ·{" "}
					{severity} severity
				</p>
			</div>
		</div>
	);
}
