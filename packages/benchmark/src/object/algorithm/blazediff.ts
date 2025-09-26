import diff from "@blazediff/object";
import type { ObjectAlgorithmBenchmarkArgs, ObjectAlgorithmBenchmarkResult } from "./types";

export function blazediffObjectAlgorithmBenchmark({
	pairs,
	iterations,
	warmup,
}: ObjectAlgorithmBenchmarkArgs): ObjectAlgorithmBenchmarkResult {
	const result: ObjectAlgorithmBenchmarkResult = [];

	for (const pair of pairs) {
		const { a, b } = pair;

		// Warmup
		for (let i = 0; i < warmup; i++) {
			diff(a as any, b as any);
		}

		const durations: number[] = [];
		let hasDiff = false;

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			const diffResult = diff(a as any, b as any);
			const end = performance.now();
			const duration = end - start;
			durations.push(duration);

			if (i === 0) {
				hasDiff = diffResult.length > 0;
			}
		}

		const average =
			durations.reduce((acc, duration) => acc + duration, 0) / durations.length;
		const median = durations.sort((a, b) => a - b)[
			Math.floor(durations.length / 2)
		];

		result.push({ average, median, diff: hasDiff });
	}

	return result;
}