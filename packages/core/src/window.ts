/**
 * Window side for the `windowSize` option, or 0 when windowing is off.
 * Floored and clamped to [1, min(width, height)] like pixelmatch.
 */
export function windowSide(
	windowSize: number,
	width: number,
	height: number,
): number {
	if (!Number.isFinite(windowSize)) return 0;
	return Math.min(Math.max(Math.floor(windowSize), 1), width, height);
}

/**
 * Largest number of counted diff pixels (`diffMap[i] === 1`) in any n×n
 * window. Only rows [minY, maxY] hold diffs, so the scan is bounded to the
 * bands that can be non-zero.
 */
export function maxWindowCount(
	diffMap: Uint8Array,
	width: number,
	height: number,
	n: number,
	minY: number,
	maxY: number,
): number {
	const colSum = new Uint32Array(width);
	const yEnd = Math.min(height - 1, maxY + n - 1);
	let maxCount = 0;
	// Diff pixels in the current n-row band: an upper bound for every window in it.
	let bandTotal = 0;

	for (let y = minY; y <= yEnd; y++) {
		const rowStart = y * width;
		const leaving = y - n;
		if (leaving >= 0) {
			const leavingStart = leaving * width;
			for (let x = 0; x < width; x++) {
				const d = diffMap[rowStart + x] - diffMap[leavingStart + x];
				colSum[x] += d;
				bandTotal += d;
			}
		} else {
			for (let x = 0; x < width; x++) {
				const e = diffMap[rowStart + x];
				colSum[x] += e;
				bandTotal += e;
			}
			if (y < n - 1) continue;
		}

		if (bandTotal <= maxCount) continue;

		let windowSum = 0;
		for (let x = 0; x < n - 1; x++) windowSum += colSum[x];
		for (let x = n - 1; x < width; x++) {
			windowSum += colSum[x];
			if (windowSum > maxCount) maxCount = windowSum;
			windowSum -= colSum[x - n + 1];
		}
	}

	return maxCount;
}
