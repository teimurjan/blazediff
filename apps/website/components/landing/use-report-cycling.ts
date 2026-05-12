"use client";

import { useEffect, useRef, useState } from "react";

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
	intervalMs = 2000,
): UseReportCyclingResult<R> {
	const [activeIndex, setActiveIndex] = useState(0);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		if (regions.length === 0) return;
		intervalRef.current = setInterval(() => {
			setActiveIndex((i) => (i + 1) % regions.length);
		}, intervalMs);
		return () => {
			if (intervalRef.current) clearInterval(intervalRef.current);
		};
	}, [regions.length, intervalMs]);

	return { activeIndex, active: regions[activeIndex], regions };
}
