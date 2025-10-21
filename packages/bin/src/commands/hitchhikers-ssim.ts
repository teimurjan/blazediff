#!/usr/bin/env node

import hitchhikersSSIM from "@blazediff/ssim/hitchhikers-ssim";

function printUsage(): void {
	console.log(`
Usage: blazediff hitchhikers-ssim <image1> <image2> [options]

Arguments:
  image1    Path to the first image
  image2    Path to the second image

Options:
  -o, --output <path>      Output path for SSIM map visualization
  --transformer <name>     Specify transformer to use (e.g. pngjs, sharp)
  --window-size <size>     Window size (default: 11)
  --window-stride <size>   Window stride (default: windowSize for non-overlapping)
  --no-cov-pooling         Use mean pooling instead of CoV pooling
  -h, --help               Show this help message

About Hitchhiker's SSIM:
  - Uses rectangular windows with integral images (summed area tables)
  - O(1) window computation regardless of window size
  - Coefficient of Variation (CoV) pooling by default
  - Significantly faster than Gaussian-based SSIM

  Reference: "A Hitchhiker's Guide to Structural Similarity"
  (IEEE Access, 2021) by Venkataramanan et al.

Examples:
  blazediff hitchhikers-ssim image1.png image2.png
  blazediff hitchhikers-ssim image1.png image2.png -o ssim-map.png
  blazediff hitchhikers-ssim image1.png image2.png --window-size 16 --window-stride 8
  blazediff hitchhikers-ssim image1.png image2.png --no-cov-pooling
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
		const options: Record<string, string | number | boolean> = {
			covPooling: false, // Default to CoV pooling
		};

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
				case "--window-size":
					if (nextArg) {
						const size = Number.parseInt(nextArg, 10);
						if (Number.isNaN(size) || size <= 0) {
							throw new Error(`Invalid window size: ${nextArg}`);
						}
						options.windowSize = size;
						i++;
					}
					break;
				case "--window-stride":
					if (nextArg) {
						const stride = Number.parseInt(nextArg, 10);
						if (Number.isNaN(stride) || stride <= 0) {
							throw new Error(`Invalid window stride: ${nextArg}`);
						}
						options.windowStride = stride;
						i++;
					}
					break;
				case "--no-cov-pooling":
					options.covPooling = false;
					break;
				default:
					console.error(`Unknown option: ${arg}`);
					printUsage();
					process.exit(1);
			}
		}

		const transformer = await getTransformer(options.transformer as string | undefined);

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

		// Prepare Hitchhiker's SSIM options
		const ssimOptions: {
			windowSize?: number;
			windowStride?: number;
			covPooling?: boolean;
		} = {};

		if (typeof options.windowSize === "number") {
			ssimOptions.windowSize = options.windowSize;
		}
		if (typeof options.windowStride === "number") {
			ssimOptions.windowStride = options.windowStride;
		}
		if (typeof options.covPooling === "boolean") {
			ssimOptions.covPooling = options.covPooling;
		}

		// Run Hitchhiker's SSIM
		const startTime = performance.now();
		const score = hitchhikersSSIM(img1.data, img2.data, outputData, img1.width, img1.height, ssimOptions);
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
			poolingMethod: ssimOptions.covPooling === false ? "mean" : "CoV",
			windowSize: ssimOptions.windowSize || 11,
			windowStride: ssimOptions.windowStride || ssimOptions.windowSize || 11,
		};

		console.log(`completed in: ${result.duration.toFixed(2)}ms`);
		console.log(`dimensions: ${result.width}x${result.height}`);
		console.log(`window: ${result.windowSize}x${result.windowSize} (stride: ${result.windowStride})`);
		console.log(`pooling: ${result.poolingMethod}`);
		console.log(
			`Hitchhiker's SSIM score: ${result.score.toFixed(6)} (0=different, 1=identical)`,
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
