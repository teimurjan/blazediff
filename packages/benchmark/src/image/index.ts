#!/usr/bin/env node

import { join } from "node:path";
import type { BenchmarkArgs, ImagePair } from "./types";
import {
	getImagePairs,
	loadImagePairs,
	outputResults,
	parseBenchmarkArgs,
	shuffleArray,
} from "./utils";

async function runBenchmark({
	variant,
	target,
	iterations,
	format,
	output,
}: BenchmarkArgs) {
	try {
		const fourKImagePairs = shuffleArray(
			getImagePairs(join(__dirname, "../fixtures"), "4k"),
		);
		const pixelmatchImagePairs = shuffleArray(
			getImagePairs(join(__dirname, "../fixtures"), "pixelmatch"),
		);
		const blazediffImagePairs = shuffleArray(
			getImagePairs(join(__dirname, "../fixtures"), "blazediff"),
		);
		const pageImagePairs = shuffleArray(
			getImagePairs(join(__dirname, "../fixtures"), "page"),
		);
		const sameImagePairs = shuffleArray(
			getImagePairs(join(__dirname, "../fixtures"), "same"),
		);

		const pairs = [
			...pixelmatchImagePairs,
			...blazediffImagePairs,
			...fourKImagePairs,
			...pageImagePairs,
		];

		// Identical have equal metadata, while same pairs are visually identical
		const identicalPairs: ImagePair[] = [];
		for (const pair of pairs) {
			identicalPairs.push({
				a: pair.a,
				b: pair.a,
				name: `${pair.name} (identical)`,
			});
		}
		pairs.push(...identicalPairs);

		// Add same image pairs later to exclude them from identical pairs
		if (variant === "algorithm") {
			pairs.push(...sameImagePairs);
		}

		shuffleArray(pairs);

		const warmup = 5;

		if (variant === "algorithm") {
			const pairsLoaded = await loadImagePairs(pairs);

			if (target === "blazediff") {
				const { blazediffAlgorithmBenchmark } = await import(
					"./algorithm/blazediff"
				);
				const results = blazediffAlgorithmBenchmark({
					pairs: pairsLoaded,
					iterations,
					warmup,
				});
				outputResults(pairs, results, format, output);
			} else if (target === "pixelmatch") {
				const { pixlematchAlgorithmBenchmark } = await import(
					"./algorithm/pixlematch"
				);
				const results = pixlematchAlgorithmBenchmark({
					pairs: pairsLoaded,
					iterations,
					warmup,
				});
				outputResults(pairs, results, format, output);
			}
		}
	} catch (error) {
		console.error("❌ Benchmark failed:", error);
		process.exit(1);
	}
}

async function main() {
	const { iterations, target, variant, format, output } = parseBenchmarkArgs();

	await runBenchmark({ target, variant, iterations, format, output });
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}
