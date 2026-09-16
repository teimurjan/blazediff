"use client";

import { useEffect, useState } from "react";

export interface TimelineState {
	/** Number of cues that have fired; `cues.length` is the final state. */
	step: number;
	/** Increments per loop so keyed children can replay CSS animations. */
	cycle: number;
}

/**
 * Fires `cues` (ms offsets from loop start) in order and restarts after
 * `loopMs`. Under `prefers-reduced-motion` it jumps straight to the final
 * state and never loops. `cues` must be referentially stable.
 */
export function useTimeline(
	cues: readonly number[],
	loopMs: number,
): TimelineState {
	const [state, setState] = useState<TimelineState>({ step: 0, cycle: 0 });

	useEffect(() => {
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
			setState({ step: cues.length, cycle: 0 });
			return;
		}

		let timers: ReturnType<typeof setTimeout>[] = [];
		const play = (cycle: number) => {
			setState({ step: 0, cycle });
			timers = cues.map((at, i) =>
				setTimeout(() => setState({ step: i + 1, cycle }), at),
			);
			timers.push(setTimeout(() => play(cycle + 1), loopMs));
		};
		play(0);

		return () => {
			for (const timer of timers) clearTimeout(timer);
		};
	}, [cues, loopMs]);

	return state;
}
