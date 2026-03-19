"use client";

import { IconArrowRight } from "@tabler/icons-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useInView } from "../hooks/use-in-view";

interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface ChangeRegion {
	bbox: BoundingBox;
	pixelCount: number;
	percentage: number;
	position: string;
	shape: string;
	changeType: string;
	confidence: number;
}

interface InterpretResult {
	summary: string;
	totalRegions: number;
	regions: ChangeRegion[];
	severity: string;
	diffPercentage: number;
	width: number;
	height: number;
}

interface HeroInterpretCyclingProps {
	fixtureA: string;
	fixtureB: string;
	interpretResult: InterpretResult;
}

const CHANGE_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
	addition: {
		bg: "bg-green-100 dark:bg-green-900/40",
		text: "text-green-700 dark:text-green-300",
	},
	deletion: {
		bg: "bg-red-100 dark:bg-red-900/40",
		text: "text-red-700 dark:text-red-300",
	},
	"content-change": {
		bg: "bg-amber-100 dark:bg-amber-900/40",
		text: "text-amber-700 dark:text-amber-300",
	},
};

export default function HeroInterpretCycling({
	fixtureA,
	fixtureB,
	interpretResult,
}: HeroInterpretCyclingProps) {
	const [sectionRef, isInView] = useInView(0.3);
	const [activeIndex, setActiveIndex] = useState<number | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (!isInView || interpretResult.regions.length === 0) return;

		setActiveIndex(0);
		let current = 0;

		intervalRef.current = setInterval(() => {
			current = (current + 1) % interpretResult.regions.length;
			setActiveIndex(current);
		}, 3500);

		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [isInView, interpretResult.regions.length]);

	const activeRegion =
		activeIndex !== null ? interpretResult.regions[activeIndex] : null;
	const isActive = activeRegion !== null;

	// Track last bbox so spotlight transitions between regions, never snaps to center
	const lastBbox = useRef<BoundingBox | null>(null);
	if (activeRegion?.bbox) {
		lastBbox.current = activeRegion.bbox;
	}
	const displayBbox = lastBbox.current ?? interpretResult.regions[0]?.bbox;

	return (
		<div ref={sectionRef}>
			<div className="flex items-center gap-3 md:gap-5 flex-col md:flex-row">
				{/* Source images with spotlights */}
				<div className="flex gap-2 md:gap-3 min-w-0 flex-[2]">
					<div className="flex-1 min-w-0">
						<div className="relative overflow-hidden rounded-lg">
							<Image
								src={fixtureA}
								alt="Original"
								className="w-full"
								width={400}
								height={400}
							/>
							{displayBbox && (
								<RegionSpotlight
									bbox={displayBbox}
									imageWidth={interpretResult.width}
									imageHeight={interpretResult.height}
									visible={isActive}
								/>
							)}
						</div>
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
							Original
						</p>
					</div>
					<div className="flex-1 min-w-0">
						<div className="relative overflow-hidden rounded-lg">
							<Image
								src={fixtureB}
								alt="Modified"
								className="w-full"
								width={400}
								height={400}
							/>
							{displayBbox && (
								<RegionSpotlight
									bbox={displayBbox}
									imageWidth={interpretResult.width}
									imageHeight={interpretResult.height}
									visible={isActive}
								/>
							)}
						</div>
						<p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5 text-center">
							Modified
						</p>
					</div>
				</div>

				{/* Arrow */}
				<div className="hidden items-center justify-center shrink-0 w-8 md:w-12 md:flex">
					<IconArrowRight
						className={`w-5 h-5 md:w-6 md:h-6 transition-colors duration-500 ${isActive ? "text-blue-500" : "text-gray-300 dark:text-gray-600"}`}
					/>
				</div>

				{/* Region description */}
				<div className="flex-1 min-w-0 w-full md:w-auto">
					<div
						className={`transition-opacity duration-500 ease-out ${isActive ? "opacity-100" : "opacity-0"}`}
					>
						{activeRegion && <RegionCard region={activeRegion} />}
					</div>
				</div>
			</div>
		</div>
	);
}

function RegionSpotlight({
	bbox,
	imageWidth,
	imageHeight,
	visible,
}: {
	bbox: BoundingBox;
	imageWidth: number;
	imageHeight: number;
	visible: boolean;
}) {
	return (
		<div
			className="absolute pointer-events-none rounded-sm transition-all duration-700 ease-out"
			style={{
				left: `${(bbox.x / imageWidth) * 100}%`,
				top: `${(bbox.y / imageHeight) * 100}%`,
				width: `${(bbox.width / imageWidth) * 100}%`,
				height: `${(bbox.height / imageHeight) * 100}%`,
				boxShadow: visible
					? "0 0 0 9999px rgba(0, 0, 0, 0.7)"
					: "0 0 0 9999px rgba(0, 0, 0, 0)",
			}}
		/>
	);
}

function RegionCard({ region }: { region: ChangeRegion }) {
	const colors =
		CHANGE_TYPE_COLORS[region.changeType] ??
		CHANGE_TYPE_COLORS["content-change"];

	return (
		<div className="p-3 md:p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 space-y-2">
			<span
				className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
			>
				{region.changeType}
			</span>
			<div className="space-y-1 text-xs text-gray-600 dark:text-gray-400">
				<p>
					<span className="text-gray-400 dark:text-gray-500">position</span>{" "}
					{region.position}
				</p>
				<p>
					<span className="text-gray-400 dark:text-gray-500">area</span>{" "}
					{region.percentage.toFixed(2)}%
				</p>
				<p>
					<span className="text-gray-400 dark:text-gray-500">shape</span>{" "}
					{region.shape}
				</p>
				<p>
					<span className="text-gray-400 dark:text-gray-500">bbox</span>{" "}
					{region.bbox.x},{region.bbox.y} {region.bbox.width}&times;
					{region.bbox.height}
				</p>
			</div>
		</div>
	);
}
