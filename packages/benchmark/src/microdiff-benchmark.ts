#!/usr/bin/env node

import microdiff from "microdiff";
import { Bench, hrtimeNow } from "tinybench";
import { objectPairs } from "../fixtures/object";
import { parseBenchmarkArgs } from "./object-utils";
import { shuffleArray } from "./utils";

async function main() {
	const { iterations, format, output } = parseBenchmarkArgs();

	const pairs = shuffleArray([...objectPairs]);

	const bench = new Bench({
		iterations,
		warmupIterations: 50,
		time: 0,
		now: hrtimeNow,
	});

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i];
		const { a, b } = pair;

		bench.add(`microdiff - pair ${i + 1}`, () => {
			microdiff(a as any, b as any);
		});
	}

	await bench.run();

	console.log("\n📦 Microdiff Benchmark Results:\n");
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
