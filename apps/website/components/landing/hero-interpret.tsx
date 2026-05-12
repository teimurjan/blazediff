"use client";

import RegionImage from "./region-image";
import TerminalFrame from "./terminal-frame";
import { type CyclingRegion, useReportCycling } from "./use-report-cycling";

interface HeroInterpretProps {
	fixtureBaseline: string;
	fixtureCurrent: string;
	imageWidth: number;
	imageHeight: number;
	regions: CyclingRegion[];
}

export default function HeroInterpret({
	fixtureBaseline,
	fixtureCurrent,
	imageWidth,
	imageHeight,
	regions,
}: HeroInterpretProps) {
	const { activeIndex, active } = useReportCycling(regions);
	if (!active) return null;

	return (
		<div data-blazediff-agent-mask>
			<TerminalFrame title="$ npx @blazediff/cli a.png b.png --interpret">
				<div className="p-3 bg-canvas grid grid-cols-2 gap-3">
					<RegionImage
						label="BASELINE"
						src={fixtureBaseline}
						alt="baseline"
						imageWidth={imageWidth}
						imageHeight={imageHeight}
						regions={regions}
						activeIndex={activeIndex}
					/>
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
			</TerminalFrame>
		</div>
	);
}
