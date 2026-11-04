#!/usr/bin/env node

import { diff } from "@blazediff/core-native";
import {
	loadMask,
	parseCoreArgs,
	reportResult,
	SHARED_FLAGS,
} from "./_core-shared";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core-native <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
${SHARED_FLAGS}
  --compression <num>       PNG compression level (0-9, default: 0)
  --quality <num>           JPEG quality (1-100, default: 90)
  -h, --help                Show this help message

Examples:
  blazediff-cli core-native image1.png image2.png -o diff.png
  blazediff-cli core-native image1.png image2.png -o diff.png -t 0.05 --no-antialiasing

For region analysis of what changed, use the interpret command:
  blazediff-cli interpret image1.png image2.png
`);
}

export default async function main(): Promise<void> {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
			printUsage();
			process.exit(0);
		}

		const parsed = parseCoreArgs(args, printUsage, { native: true });
		const { outputPath, compression, quality } = parsed;

		const startTime = performance.now();
		const result = await diff(parsed.image1, parsed.image2, {
			...parsed.options,
			mask: parsed.maskPath ? await loadMask(parsed.maskPath) : undefined,
			output: outputPath
				? { path: outputPath, compression, quality }
				: undefined,
		});
		const duration = performance.now() - startTime;

		if (result.kind === "io-error") {
			console.error(`Error: ${result.message}`);
			process.exit(2);
		}
		reportResult(result, { json: parsed.json, outputPath, duration });
	} catch (error) {
		console.error(
			"Error:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(2);
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
