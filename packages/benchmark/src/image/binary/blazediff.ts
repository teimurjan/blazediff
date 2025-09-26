import { safeExecSync } from "../utils";
import type { BinaryBenchmarkArgs, BinaryBenchmarkResult } from "./types";

const blazediff = (a: string, b: string) => {
	const bin = "pnpm --filter @blazediff/benchmark exec blazediff";
	return safeExecSync(`${bin} ${a} ${b} --transformer sharp`);
};

export function blazediffBinaryBenchmark({
	pairs,
	iterations,
	warmup,
}: BinaryBenchmarkArgs): BinaryBenchmarkResult {
	const result: BinaryBenchmarkResult = [];

	for (const pair of pairs) {
		const { a, b } = pair;
		for (let i = 0; i < warmup; i++) {
			blazediff(a, b);
		}

		const durations: number[] = [];

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			blazediff(a, b);
			const end = performance.now();
			const duration = end - start;
			durations.push(duration);
		}

		const average =
			durations.reduce((acc, duration) => acc + duration, 0) / durations.length;
		const median = durations.sort((a, b) => a - b)[
			Math.floor(durations.length / 2)
		];

		result.push({ average, median });
	}

	return result;
}
