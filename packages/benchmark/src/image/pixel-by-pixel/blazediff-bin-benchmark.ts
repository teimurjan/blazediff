#!/usr/bin/env node

import { compare } from "@blazediff/bin";
import { Bench, hrtimeNow } from "tinybench";
import { getBenchmarkImagePairs, parseBenchmarkArgs } from "../utils";

async function main() {
	const { iterations, format, output } = parseBenchmarkArgs();

	const pairs = getBenchmarkImagePairs();

	const bench = new Bench({
		iterations,
		warmupIterations: 5,
		time: 0,
		now: hrtimeNow,
	});

	for (let i = 0; i < pairs.length; i++) {
		const pair = pairs[i];

		bench.add(`blazediff - ${pairs[i].name}`, async () => {
			await compare(pair.a, pair.b, "/tmp/test.png", { antialiasing: true });
		});
	}

	await bench.run();

	console.log("\n🔥 BlazeDiff Benchmark Results:\n");
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
