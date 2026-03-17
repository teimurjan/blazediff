#!/usr/bin/env node

import { type InterpretOptions, interpret } from "@blazediff/interpret-native";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli interpret <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -t, --threshold <num>     Color difference threshold (0 to 1, default: 0.1)
  -a, --antialiasing        Enable anti-aliasing detection
  --compact                 Return compact results (summary + severity only)
  -h, --help                Show this help message

Examples:
  blazediff-cli interpret image1.png image2.png
  blazediff-cli interpret image1.png image2.png -t 0.05 -a
  blazediff-cli interpret image1.png image2.png --compact
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
		const options: InterpretOptions = {};

		for (let i = 2; i < args.length; i++) {
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
				case "--compact":
					options.compact = true;
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const startTime = performance.now();
		const result = await interpret(image1, image2, options);
		const duration = performance.now() - startTime;

		console.log(`completed in: ${duration.toFixed(2)}ms`);
		console.log(JSON.stringify(result, null, 2));

		if (result.diffPercentage === 0) {
			process.exit(0);
		}
		process.exit(1);
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
