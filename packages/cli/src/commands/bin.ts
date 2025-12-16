#!/usr/bin/env node

import { type BlazeDiffOptions, compare } from "@blazediff/bin";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli bin <image1> <image2> <output> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image
  output    Path for the diff image output

Options:
  -t, --threshold <num>     Color difference threshold (0 to 1, default: 0.1)
  -a, --antialiasing        Enable anti-aliasing detection
  --diff-mask               Output only differences (transparent background)
  --fail-on-layout          Fail immediately if images have different dimensions
  -c, --compression <num>   PNG compression level (0-9, default: 0)
  -h, --help                Show this help message

Examples:
  blazediff-cli bin image1.png image2.png diff.png
  blazediff-cli bin image1.png image2.png diff.png -t 0.05 -a
  blazediff-cli bin image1.png image2.png diff.png --threshold 0.2 --antialiasing
`);
}

export default async function main(): Promise<void> {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
			printUsage();
			process.exit(0);
		}

		if (args.length < 3) {
			console.error("Error: Two image paths and an output path are required");
			printUsage();
			process.exit(1);
		}

		const image1 = args[0];
		const image2 = args[1];
		const output = args[2];
		const options: BlazeDiffOptions = {};

		for (let i = 3; i < args.length; i++) {
			const arg = args[i];
			const nextArg = args[i + 1];

			switch (arg) {
				case "-t":
				case "--threshold":
					if (nextArg) {
						const threshold = parseFloat(nextArg);
						if (Number.isNaN(threshold) || threshold < 0 || threshold > 1) {
							throw new Error(
								`Invalid threshold: ${nextArg}. Must be between 0 and 1`,
							);
						}
						options.threshold = threshold;
						i++;
					}
					break;
				case "-a":
				case "--antialiasing":
					options.antialiasing = true;
					break;
				case "--diff-mask":
					options.diffMask = true;
					break;
				case "--fail-on-layout":
					options.failOnLayoutDiff = true;
					break;
				case "-c":
				case "--compression":
					if (nextArg) {
						const compression = parseInt(nextArg, 10);
						if (
							Number.isNaN(compression) ||
							compression < 0 ||
							compression > 9
						) {
							throw new Error(
								`Invalid compression: ${nextArg}. Must be between 0 and 9`,
							);
						}
						options.compression = compression;
						i++;
					}
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const startTime = performance.now();
		const result = await compare(image1, image2, output, options);
		const duration = performance.now() - startTime;

		console.log(`completed in: ${duration.toFixed(2)}ms`);

		if (result.match) {
			console.log("Images are identical!");
			process.exit(0);
		}

		if (result.reason === "layout-diff") {
			console.log("Images have different dimensions");
			process.exit(1);
		}

		if (result.reason === "file-not-exists") {
			console.error(`File not found: ${result.file}`);
			process.exit(2);
		}

		if (result.reason === "pixel-diff") {
			console.log(`different pixels: ${result.diffCount}`);
			console.log(`error: ${result.diffPercentage.toFixed(2)}%`);
			console.log(`diff image: ${output}`);
			process.exit(1);
		}
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
