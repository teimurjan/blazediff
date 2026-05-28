import { availableParallelism, cpus } from "node:os";
import type { Viewport, WaitFor } from "./types";

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
export const DEFAULT_WAIT_FOR: WaitFor[] = ["networkidle", "fonts"];
export const DEFAULT_FULL_PAGE = true;
export const DEFAULT_THRESHOLD = 0.1;
export const DEFAULT_PORT = 3000;
export const DEFAULT_REVIEW_PORT = 4321;
export const DEFAULT_READY_TIMEOUT_MS = 60_000;

const MIN_AUTO_CONCURRENCY = 2;
const MAX_AUTO_CONCURRENCY = 8;

/** Host CPU count, with a safe floor; uses availableParallelism where supported. */
export function cpuCores(): number {
	const cores =
		typeof availableParallelism === "function"
			? availableParallelism()
			: cpus().length;
	if (!cores || !Number.isFinite(cores)) return MIN_AUTO_CONCURRENCY;
	return cores;
}

export function defaultConcurrency(): number {
	return Math.max(
		MIN_AUTO_CONCURRENCY,
		Math.min(MAX_AUTO_CONCURRENCY, cpuCores() - 1),
	);
}
