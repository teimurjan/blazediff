#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import pixelmatch from "pixelmatch";
import { Bench, hrtimeNow } from "tinybench";
import {
	getBenchmarkImagePairs,
	loadImagePairs,
	parseBenchmarkArgs,
} from "../utils";

// `@blazediff/core-wasm` is ESM-only and its wasm-bindgen glue uses
// `import.meta.url` to locate the sibling `.wasm` file; bundling it into a
// CJS bundle would re-anchor that URL and break the lookup. Mark it external
// in tsup.config.ts and load it via a dynamic import so the bundler keeps the
// reference live at runtime.
const loadCoreWasm = () =>
	Function(`return import("@blazediff/core-wasm")`)() as Promise<
		typeof import("@blazediff/core-wasm")
	>;

async function main() {
	const { iterations, format, output, fixtures } = parseBenchmarkArgs();

	const pairs = getBenchmarkImagePairs(fixtures);
	const pairsLoaded = await loadImagePairs(pairs);

	const { diff: coreWasmDiff, initBlazediff } = await loadCoreWasm();
	// The wasm-bindgen `--target web` glue calls `fetch()` on `import.meta.url`,
	// which Node can't satisfy for `file://`. Read the bytes ourselves and hand
	// them to `initBlazediff`; same pattern as the core-wasm test suite.
	const wasmPath = createRequire(__filename).resolve(
		"@blazediff/core-wasm/wasm/blazediff_bg.wasm",
	);
	await initBlazediff(readFileSync(wasmPath));

	const bench = new Bench({
		iterations,
		warmupIterations: 5,
		time: 0,
		now: hrtimeNow,
	});

	for (let i = 0; i < pairsLoaded.length; i++) {
		const pair = pairsLoaded[i];
		const { a, b } = pair;

		bench.add(`core-wasm - ${pairs[i].name}`, async () => {
			await coreWasmDiff(a.data, b.data, a.width, a.height);
		});

		bench.add(`pixelmatch - ${pairs[i].name}`, () => {
			pixelmatch(a.data, b.data, undefined, a.width, a.height);
		});
	}

	await bench.run();

	console.log("\n🔥 BlazeDiff core-wasm vs Pixelmatch Benchmark Results:\n");
	console.table(
		bench.tasks
			.map((task) => ({
				Name: task.name,
				"Ops/sec": task.result?.throughput.mean.toFixed(2),
				"Avg (ms)": task.result?.latency.mean
					? task.result.latency.mean.toFixed(4)
					: "N/A",
				"Min (ms)": task.result?.latency.min
					? task.result.latency.min.toFixed(4)
					: "N/A",
				"Max (ms)": task.result?.latency.max
					? task.result.latency.max.toFixed(4)
					: "N/A",
			}))
			.sort((a, b) => a.Name.localeCompare(b.Name)),
	);

	if (format === "json" && output) {
		const { writeFileSync } = await import("node:fs");
		const results = bench.tasks
			.map((task) => ({
				name: task.name,
				throughput: task.result?.throughput.mean,
				latency: {
					mean: task.result?.latency.mean,
					min: task.result?.latency.min,
					max: task.result?.latency.max,
				},
			}))
			.sort((a, b) => a.name.localeCompare(b.name));
		writeFileSync(output, JSON.stringify(results, null, 2));
		console.log(`\n✅ Results saved to ${output}`);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
