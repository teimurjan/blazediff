#!/usr/bin/env node

import pixelmatch from "pixelmatch";
import { Bench, hrtimeNow } from "tinybench";
import {
	getBenchmarkImagePairs,
	loadImagePairs,
	parseBenchmarkArgs,
} from "./image-utils";

async function main() {
	const { iterations, format, output } = parseBenchmarkArgs();

	const pairs = getBenchmarkImagePairs();
	const pairsLoaded = await loadImagePairs(pairs);

	const bench = new Bench({
		iterations,
		warmupIterations: 5,
		time: 0,
		now: hrtimeNow,
	});

	for (let i = 0; i < pairsLoaded.length; i++) {
		const pair = pairsLoaded[i];
		const { a, b } = pair;

		bench.add(`pixelmatch - ${pairs[i].name}`, () => {
			pixelmatch(a.data, b.data, undefined, a.width, a.height);
		});
	}

	await bench.run();

	console.log("\n🔍 Pixelmatch Benchmark Results:\n");
	console.table(
		bench.tasks
			.map((task) => ({
				Name: task.name,
				"Ops/sec": task.result?.throughput.mean.toFixed(2),
				"Avg (ms)": task.result?.latency.mean
					? (task.result.latency.mean / 1000).toFixed(6)
					: "N/A",
				"Min (ms)": task.result?.latency.min
					? (task.result.latency.min / 1000).toFixed(6)
					: "N/A",
				"Max (ms)": task.result?.latency.max
					? (task.result.latency.max / 1000).toFixed(6)
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
