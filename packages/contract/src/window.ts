/**
 * Window side for the `window` option, or 0 when windowing is off.
 * Floored and clamped to [1, min(width, height)] like pixelmatch.
 */
export function windowSide(
	window: number | undefined,
	width: number,
	height: number,
): number {
	if (window === undefined || !Number.isFinite(window)) return 0;
	return Math.min(Math.max(Math.floor(window), 1), width, height);
}
