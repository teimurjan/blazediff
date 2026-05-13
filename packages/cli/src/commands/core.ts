#!/usr/bin/env node

import blazediff from "@blazediff/core";
import { parseCoreArgs, runCoreDiff } from "./_core-shared";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>       Output path for the diff image
  -t, --threshold <num>     Matching threshold (0 to 1, default: 0.1)
  -a, --alpha <num>         Opacity of original image in diff (default: 0.1)
  --aa-color <r,g,b>        Color for anti-aliased pixels (default: 255,255,0)
  --diff-color <r,g,b>      Color for different pixels (default: 255,0,0)
  --diff-color-alt <r,g,b>  Alternative color for dark differences (default: same as diff-color)
  --include-aa              Include anti-aliasing detection
  --diff-mask               Draw diff over transparent background
  --codec <name>            Specify codec to use (pngjs, sharp, jsquash-png)
  -h, --help                Show this help message

Examples:
  blazediff-cli core image1.png image2.png
  blazediff-cli core image1.png image2.png -o diff.png -t 0.05
  blazediff-cli core image1.png image2.png --threshold 0.2 --alpha 0.3
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

		await runCoreDiff(parsed, (a, b, width, height, output, options) =>
			blazediff(a, b, output, width, height, options),
		);
	} catch (error) {
		console.error(
			"Error:",
			error instanceof Error ? error.message : String(error),
		);
		process.exit(1);
	}
}

if (typeof require !== "undefined" && require.main === module) {
	main();
}
