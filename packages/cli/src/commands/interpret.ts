#!/usr/bin/env node

import {
	type InterpretOptions,
	type InterpretResult,
	interpret,
	interpretRegions,
	type RegionSource,
} from "@blazediff/interpret-native";

const SOURCES: RegionSource[] = [
	"pixel",
	"ssim",
	"ms-ssim",
	"hitchhikers-ssim",
];

function printUsage(): void {
	console.log(`
Usage: blazediff-cli interpret <image1> <image2> [output] [options]

Describes *what* changed between two images — region by region, with a change
type, position and shape — rather than only which pixels differ.

Arguments:
  image1    Path to the first image
  image2    Path to the second image
  output    Path for the diff visualization (optional; the pixel source
            writes it, the metric sources and --regions do not)

Options:
  --source <name>           How to locate regions: pixel (default), ssim,
                            ms-ssim, hitchhikers-ssim
  -t, --threshold <num>     Color difference threshold (0 to 1, default: 0.1).
                            pixel source only
  -a, --antialiasing        Exclude anti-aliased pixels. pixel source only
  -c, --compression <num>   PNG compression level (0-9, default: 0)
  --window-size <num>       Local window size for the metric sources (default: 11)
  --region-floor <num>      Window score at or below which it counts as changed
                            (0 to 1, default: 0.99). Metric sources only
  --regions <json>          Skip the search and classify these boxes instead.
                            A JSON array of { x, y, width, height }
  --json                    Print the full result as JSON
  -h, --help                Show this help message

The metric sources locate regions by thresholding a similarity map, so their
boxes are as coarse as that map's grid. The numbers are not: every box is
refined against the source pixels first, so pixel counts stay per-pixel.

Examples:
  blazediff-cli interpret image1.png image2.png
  blazediff-cli interpret image1.png image2.png diff.png -t 0.05 -a
  blazediff-cli interpret image1.png image2.png --source ms-ssim
  blazediff-cli interpret image1.png image2.png --json
  blazediff-cli interpret image1.png image2.png --regions '[{"x":0,"y":0,"width":64,"height":64}]'
`);
}

function parseNumber(
	value: string | undefined,
	flag: string,
	min: number,
	max: number,
): number {
	const parsed = Number.parseFloat(value ?? "");
	if (Number.isNaN(parsed) || parsed < min || parsed > max) {
		throw new Error(
			`Invalid ${flag}: ${value}. Must be between ${min} and ${max}`,
		);
	}
	return parsed;
}

function printSummary(result: InterpretResult): void {
	console.log(result.summary);
	for (const region of result.regions) {
		const { x, y, width, height } = region.bbox;
		console.log(
			`  ${region.changeType} ${region.shape} at ${region.position} ` +
				`— ${width}x${height} at (${x}, ${y}), ${region.pixelCount}px ` +
				`(${region.percentage.toFixed(2)}%)`,
		);
	}
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
		let output: string | undefined;
		let regions: string | undefined;
		let json = false;

		// Third positional arg is the output path (if not a flag).
		let optStart = 2;
		if (args.length > 2 && !args[2].startsWith("-")) {
			output = args[2];
			optStart = 3;
		}

		for (let i = optStart; i < args.length; i++) {
			const arg = args[i];
			const nextArg = args[i + 1];

			switch (arg) {
				case "--source":
					if (!nextArg || !SOURCES.includes(nextArg as RegionSource)) {
						throw new Error(
							`Invalid source: ${nextArg}. Must be one of: ${SOURCES.join(", ")}`,
						);
					}
					options.source = nextArg as RegionSource;
					i++;
					break;
				case "-t":
				case "--threshold":
					options.threshold = parseNumber(nextArg, "threshold", 0, 1);
					i++;
					break;
				case "-a":
				case "--antialiasing":
					options.antialiasing = true;
					break;
				case "-c":
				case "--compression":
					options.compression = parseNumber(nextArg, "compression", 0, 9);
					i++;
					break;
				case "--window-size":
					options.windowSize = parseNumber(nextArg, "window-size", 1, 1024);
					i++;
					break;
				case "--region-floor":
					options.regionFloor = parseNumber(nextArg, "region-floor", 0, 1);
					i++;
					break;
				case "--regions":
					if (!nextArg) {
						throw new Error("--regions requires a JSON array");
					}
					regions = nextArg;
					i++;
					break;
				case "--json":
					json = true;
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const startTime = performance.now();

		let result: InterpretResult;
		if (regions !== undefined) {
			if (output !== undefined) {
				throw new Error(
					"--regions does not write a diff visualization; drop the output path",
				);
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(regions);
			} catch {
				throw new Error("--regions must be valid JSON");
			}
			if (!Array.isArray(parsed)) {
				throw new Error("--regions must be a JSON array of boxes");
			}
			result = await interpretRegions(image1, image2, parsed);
		} else {
			result = await interpret(image1, image2, output, options);
		}

		const duration = performance.now() - startTime;
		console.log(`completed in: ${duration.toFixed(2)}ms`);

		if (json) {
			console.log(JSON.stringify(result, null, 2));
		} else {
			printSummary(result);
			if (output && result.diffCount > 0) {
				console.log(`diff output: ${output}`);
			}
		}

		process.exit(result.totalRegions === 0 ? 0 : 1);
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
