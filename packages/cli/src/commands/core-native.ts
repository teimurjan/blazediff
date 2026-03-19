#!/usr/bin/env node

import { type BlazeDiffOptions, compare, interpret } from "@blazediff/core-native";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli core-native <image1> <image2> [output] [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image
  output    Path for the diff output (optional)

Options:
  -t, --threshold <num>     Color difference threshold (0 to 1, default: 0.1)
  -a, --antialiasing        Enable anti-aliasing detection
  --diff-mask               Output only differences (transparent background)
  -c, --compression <num>   PNG compression level (0-9, default: 0)
  --interpret               Run structured interpretation (region detection + classification)
  --output-format <fmt>     Output format: png (default) or html (interpret report)
  -h, --help                Show this help message

Examples:
  blazediff-cli core-native image1.png image2.png diff.png
  blazediff-cli core-native image1.png image2.png diff.png -t 0.05 -a
  blazediff-cli core-native image1.png image2.png --interpret
  blazediff-cli core-native image1.png image2.png report.html --output-format html
`);
}

export default async function main(): Promise<void> {
	try {
		const args = process.argv.slice(2);

		if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
			printUsage();
			process.exit(0);
		}

		if (args.length < 2) {
			console.error("Error: Two image paths are required");
			printUsage();
			process.exit(1);
		}

		const image1 = args[0];
		const image2 = args[1];
		const options: BlazeDiffOptions = {};
		let output: string | undefined;

		// Third positional arg is output path (if not a flag)
		let optStart = 2;
		if (args.length > 2 && !args[2].startsWith("-")) {
			output = args[2];
			optStart = 3;
		}

		for (let i = optStart; i < args.length; i++) {
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
				case "--interpret":
					options.interpret = true;
					break;
				case "--output-format":
					if (nextArg === "png" || nextArg === "html") {
						options.outputFormat = nextArg;
						i++;
					} else {
						throw new Error(
							`Invalid output format: ${nextArg}. Must be "png" or "html"`,
						);
					}
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const startTime = performance.now();

		// Standalone interpret mode (no output path, just analysis)
		if (options.interpret && !output) {
			const result = await interpret(image1, image2, {
				threshold: options.threshold,
				antialiasing: options.antialiasing,
			});
			const duration = performance.now() - startTime;

			console.log(`completed in: ${duration.toFixed(2)}ms`);
			console.log(JSON.stringify(result, null, 2));

			process.exit(result.diffPercentage === 0 ? 0 : 1);
			return;
		}

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
			if (output) {
				console.log(`diff output: ${output}`);
			}
			if ("interpretation" in result && result.interpretation) {
				console.log(JSON.stringify(result.interpretation, null, 2));
			}
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
