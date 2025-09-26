#!/usr/bin/env node

import { objectPairs } from "../../fixtures/object";
import type { BenchmarkArgs } from "./types";
import { outputResults, parseBenchmarkArgs, shuffleArray } from "./utils";

async function runObjectBenchmark({
	target,
	iterations,
	format,
	output,
}: BenchmarkArgs) {
	try {
		const pairs = shuffleArray([...objectPairs]);
		const warmup = 50;

		if (target === "blazediff") {
			const { blazediffObjectAlgorithmBenchmark } = await import(
				"./algorithm/blazediff"
			);
			const results = blazediffObjectAlgorithmBenchmark({
				pairs,
				iterations,
				warmup,
			});
			outputResults(pairs, results, format, output);
		} else if (target === "microdiff") {
			const { microdiffAlgorithmBenchmark } = await import(
				"./algorithm/microdiff"
			);
			const results = microdiffAlgorithmBenchmark({
				pairs,
				iterations,
				warmup,
			});
			outputResults(pairs, results, format, output);
		} else {
			console.error(`❌ Unknown target: ${target}`);
			process.exit(1);
		}
	} catch (error) {
		console.error("❌ Object benchmark failed:", error);
		process.exit(1);
	}
}

async function main() {
	const { iterations, target, variant, format, output } = parseBenchmarkArgs();

	if (variant !== "object") {
		console.error(`❌ This is an object benchmark, but variant is: ${variant}`);
		process.exit(1);
	}

	await runObjectBenchmark({ target, variant, iterations, format, output });
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
