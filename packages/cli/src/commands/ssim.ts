#!/usr/bin/env node

import ssim from "@blazediff/ssim/ssim";

function printUsage(): void {
	console.log(`
Usage: blazediff-cli ssim <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>    Output path for SSIM map visualization
  --transformer <name>   Specify transformer to use (e.g. pngjs, sharp)
  -h, --help             Show this help message

Examples:
  blazediff ssim image1.png image2.png
  blazediff ssim image1.png image2.png -o ssim-map.png
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
		const options: Record<string, string> = {};

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

		const transformer = await getTransformer(options.transformer);

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

		// Run SSIM
		const startTime = performance.now();
		const score = ssim(img1.data, img2.data, outputData, img1.width, img1.height, {});
		const duration = performance.now() - startTime;

		// Write output if needed
		if (options.outputPath && outputData) {
			await transformer.write(
				{
					data: outputData,
					width: img1.width,
					height: img1.height,
				},
				options.outputPath,
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
			`SSIM score: ${result.score.toFixed(6)} (0=different, 1=identical)`,
		);
		console.log(`similarity: ${(result.score * 100).toFixed(2)}%`);

		if (options.outputPath && outputData) {
			console.log(`SSIM map saved to: ${options.outputPath}`);
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
