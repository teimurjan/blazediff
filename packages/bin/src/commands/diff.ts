#!/usr/bin/env node

import blazediff, { type CoreOptions } from "@blazediff/core";

function parseRGB(colorStr: string): [number, number, number] {
	const parts = colorStr.split(",").map((s) => parseInt(s.trim(), 10));
	if (
		parts.length !== 3 ||
		parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)
	) {
		throw new Error(
			`Invalid RGB color format: ${colorStr}. Expected format: r,g,b (e.g., 255,0,0)`,
		);
	}
	return [parts[0], parts[1], parts[2]];
}

function printUsage(): void {
	console.log(`
Usage: blazediff diff <image1> <image2> [options]

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
  --color-space <name>      Specify color space to use (e.g. yiq, ycbcr)
  --transformer <name>      Specify transformer to use (e.g. pngjs, sharp)
  -h, --help                Show this help message

Examples:
  blazediff diff image1.png image2.png
  blazediff diff image1.png image2.png -o diff.png -t 0.05
  blazediff diff image1.png image2.png --threshold 0.2 --alpha 0.3
`);
}

const getTransformer = async (transformer?: string) => {
	if (!transformer || transformer === "pngjs") {
		const { default: transformer } = await import(
			"@blazediff/pngjs-transformer"
		);
		return transformer;
	}
	if (transformer === "sharp") {
		const { default: transformer } = await import(
			"@blazediff/sharp-transformer"
		);
		return transformer;
	}
	throw new Error(`Unknown transformer: ${transformer}`);
};

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
		const options: Record<
			string,
			string | number | boolean | [number, number, number]
		> = {};

		for (let i = 2; i < args.length; i++) {
			const arg = args[i];
			const nextArg = args[i + 1];

			switch (arg) {
				case "-o":
				case "--output":
					if (nextArg) {
						options.outputPath = nextArg;
						i++;
					}
					break;
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
				case "--alpha":
					if (nextArg) {
						const alpha = parseFloat(nextArg);
						if (Number.isNaN(alpha) || alpha < 0 || alpha > 1) {
							throw new Error(
								`Invalid alpha: ${nextArg}. Must be between 0 and 1`,
							);
						}
						options.alpha = alpha;
						i++;
					}
					break;
				case "--aa-color":
					if (nextArg) {
						options.aaColor = parseRGB(nextArg);
						i++;
					}
					break;
				case "--diff-color":
					if (nextArg) {
						options.diffColor = parseRGB(nextArg);
						i++;
					}
					break;
				case "--diff-color-alt":
					if (nextArg) {
						options.diffColorAlt = parseRGB(nextArg);
						i++;
					}
					break;
				case "--include-aa":
					options.includeAA = true;
					break;
				case "--diff-mask":
					options.diffMask = true;
					break;
				case "--transformer":
					if (nextArg) {
						options.transformer = nextArg;
						i++;
					}
					break;
				case "--color-space":
					if (nextArg) {
						options.colorSpace = nextArg;
						i++;
					}
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const transformer = await getTransformer(
			options.transformer as string | undefined,
		);

		// Load images
		const [img1, img2] = await Promise.all([
			transformer.transform(image1),
			transformer.transform(image2),
		]);

		if (img1.width !== img2.width || img1.height !== img2.height) {
			throw new Error(
				`Image dimensions do not match: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`,
			);
		}

		// Prepare output buffer if needed
		let outputData: Uint8Array | undefined;
		if (options.outputPath) {
			outputData = new Uint8Array(img1.data.length);
		}

		// Run diff
		const coreOptions: CoreOptions = {
			threshold: options.threshold as number | undefined,
			alpha: options.alpha as number | undefined,
			aaColor: options.aaColor as [number, number, number] | undefined,
			diffColor: options.diffColor as [number, number, number] | undefined,
			diffColorAlt: options.diffColorAlt as
				| [number, number, number]
				| undefined,
			includeAA: options.includeAA as boolean | undefined,
			diffMask: options.diffMask as boolean | undefined,
		};

		const startTime = performance.now();
		const diffCount = blazediff(
			img1.data,
			img2.data,
			outputData,
			img1.width,
			img1.height,
			coreOptions,
		);
		const duration = performance.now() - startTime;

		// Write output if needed
		if (diffCount > 0 && options.outputPath && outputData) {
			await transformer.write(
				{
					data: outputData,
					width: img1.width,
					height: img1.height,
				},
				options.outputPath as string,
			);
		}

		const result = {
			diffCount,
			width: img1.width,
			height: img1.height,
			duration,
		};

		console.log(`completed in: ${result.duration.toFixed(2)}ms`);
		console.log(`dimensions: ${result.width}x${result.height}`);
		console.log(`different pixels: ${result.diffCount}`);
		console.log(
			`error: ${(
				(result.diffCount / (result.width * result.height)) *
				100
			).toFixed(2)}%`,
		);

		if (result.diffCount > 0 && outputData && options.outputPath) {
			console.log(`diff image: ${options.outputPath}`);
		}

		if (result.diffCount > 0) {
			process.exit(1);
		} else {
			console.log(`Images are identical!`);
			process.exit(0);
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
