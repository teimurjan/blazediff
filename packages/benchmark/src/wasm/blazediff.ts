import blazediff, { initBlazeDiffWasm } from "@blazediff/wasm";
import type { WasmBenchmarkArgs, WasmBenchmarkResult } from "./types";

export async function blazediffWasmBenchmark({
	pairs,
	iterations,
	warmup,
}: WasmBenchmarkArgs): Promise<WasmBenchmarkResult> {
	await initBlazeDiffWasm();

	const result: WasmBenchmarkResult = [];

	for (const pair of pairs) {
		const { a, b } = pair;
		for (let i = 0; i < warmup; i++) {
			await blazediff(a.data, b.data, undefined, a.width, a.height);
		}

		const durations: number[] = [];
		let diffCount = 0;

		for (let i = 0; i < iterations; i++) {
			const start = performance.now();
			diffCount = await blazediff(a.data, b.data, undefined, a.width, a.height);
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
