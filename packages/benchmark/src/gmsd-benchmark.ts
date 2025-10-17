#!/usr/bin/env node

import gmsd from "@blazediff/gmsd";
import { Bench, hrtimeNow } from "tinybench";
import {
	getSSIMImagePairs,
	loadImagePairs,
	parseBenchmarkArgs,
} from "./image-utils";

async function main() {
	const { iterations, format, output } = parseBenchmarkArgs();

	const pairs = getSSIMImagePairs();
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

		bench.add(`gmsd (full-res) - ${pairs[i].name}`, () => {
			gmsd(a.data, b.data, undefined, a.width, a.height, {
				downsample: 0,
			});
		});

		bench.add(`gmsd (2x downsample) - ${pairs[i].name}`, () => {
			gmsd(a.data, b.data, undefined, a.width, a.height, {
				downsample: 1,
			});
		});
	}

	await bench.run();

	console.log("\n📊 GMSD Benchmark Results:\n");

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
