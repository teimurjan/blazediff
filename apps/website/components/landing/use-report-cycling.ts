"use client";

import { useEffect, useState } from "react";

export interface CyclingRegion {
	bbox: { x: number; y: number; width: number; height: number };
	pixelCount: number;
	percentage: number;
	position: string;
	shape: string;
	changeType: string;
}

export interface UseReportCyclingResult<R extends CyclingRegion> {
	activeIndex: number;
	active: R | undefined;
	regions: R[];
}

export function useReportCycling<R extends CyclingRegion>(
	regions: R[],
	{ paused = false, intervalMs = 2000 } = {},
): UseReportCyclingResult<R> {
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		if (paused || regions.length === 0) return;
		const interval = setInterval(() => {
			setActiveIndex((i) => (i + 1) % regions.length);
		}, intervalMs);
		return () => clearInterval(interval);
	}, [paused, regions.length, intervalMs]);

	return { activeIndex, active: regions[activeIndex], regions };
}
