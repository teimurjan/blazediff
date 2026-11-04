#!/usr/bin/env node

import { diff } from "@blazediff/core";
import { parseCoreArgs, runCoreDiff, SHARED_FLAGS } from "./_core-shared";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
${SHARED_FLAGS}
  --codec <name>            Codec to use (pngjs, sharp, jsquash-png)
  -h, --help                Show this help message

Examples:
  blazediff-cli core image1.png image2.png
  blazediff-cli core image1.png image2.png -o diff.png -t 0.05
  blazediff-cli core image1.png image2.png --metric oklab --window 16 --json
`);
}

export default async function main(): Promise<void> {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
			printUsage();
			process.exit(0);
		}

		const parsed = parseCoreArgs(args, printUsage);

		await runCoreDiff(parsed, diff);
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
