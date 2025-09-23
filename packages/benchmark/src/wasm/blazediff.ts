import { blazediffSync, initWasm } from "@blazediff/wasm";
import type { WasmBenchmarkArgs, WasmBenchmarkResult } from "./types";

export async function blazediffWasmBenchmark({
	pairs,
	iterations,
	warmup,
}: WasmBenchmarkArgs): Promise<WasmBenchmarkResult> {
	const result: WasmBenchmarkResult = [];

	await initWasm();

	for (const pair of pairs) {
		const { a, b } = pair;

		// Warmup
		for (let i = 0; i < warmup; i++) {
			blazediffSync(a.data, b.data, null, a.width, a.height);
		}

		const durations: number[] = [];
		let diffCount = 0;

		// Benchmark
		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			diffCount = blazediffSync(a.data, b.data, null, a.width, a.height);
			const end = performance.now();
			const duration = end - start;
			durations.push(duration);
		}

		const average =
			durations.reduce((acc, duration) => acc + duration, 0) / durations.length;
		const median = durations.sort((a, b) => a - b)[
			Math.floor(durations.length / 2)
		];

		result.push({ average, median, diff: diffCount });
	}

	return result;
}
