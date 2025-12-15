#!/usr/bin/env node

import gmsd, { type GmsdOptions } from "@blazediff/gmsd";

function printUsage(): void {
	console.log(`
Usage: blazediff gmsd <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>    Output path for GMS similarity map (grayscale visualization)
  --downsample <0|1>     Downsample factor: 0=full-res, 1=2x downsample (default: 0)
  --gmsd-c <num>         Stability constant for GMSD (default: 170)
  --transformer <name>   Specify transformer to use (e.g. pngjs, sharp)
  -h, --help             Show this help message

Examples:
  blazediff gmsd image1.png image2.png
  blazediff gmsd image1.png image2.png --downsample 1
  blazediff gmsd image1.png image2.png -o gms-map.png
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
		const options: Record<string, string | number> = {};

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
				case "--downsample":
					if (nextArg) {
						const downsample = parseInt(nextArg, 10);
						if (downsample !== 0 && downsample !== 1) {
							throw new Error(`Invalid downsample: ${nextArg}. Must be 0 or 1`);
						}
						options.downsample = downsample;
						i++;
					}
					break;
				case "--gmsd-c":
					if (nextArg) {
						const gmsdC = parseFloat(nextArg);
						if (Number.isNaN(gmsdC) || gmsdC <= 0) {
							throw new Error(
								`Invalid gmsd-c: ${nextArg}. Must be a positive number`,
							);
						}
						options.gmsdC = gmsdC;
						i++;
					}
					break;
				case "--transformer":
					if (nextArg) {
						options.transformer = nextArg;
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
			transformer.read(image1),
			transformer.read(image2),
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

		// Run GMSD
		const gmsdOptions: GmsdOptions = {
			downsample: (options.downsample as 0 | 1) || 0,
			c: options.gmsdC as number | undefined,
		};

		const startTime = performance.now();
		const score = gmsd(
			img1.data,
			img2.data,
			outputData,
			img1.width,
			img1.height,
			gmsdOptions,
		);
		const duration = performance.now() - startTime;

		// Write output if needed
		if (options.outputPath && outputData) {
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
			score,
			width: img1.width,
			height: img1.height,
			duration,
		};

		console.log(`completed in: ${result.duration.toFixed(2)}ms`);
		console.log(`dimensions: ${result.width}x${result.height}`);
		console.log(
			`similarity score: ${result.score.toFixed(6)} (0=different, 1=identical)`,
		);
		console.log(`similarity: ${(result.score * 100).toFixed(2)}%`);

		if (options.outputPath && outputData) {
			console.log(`GMS map saved to: ${options.outputPath}`);
		}

		if (result.score < 0.95) {
			process.exit(1);
		} else {
			console.log(`Images are highly similar!`);
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
