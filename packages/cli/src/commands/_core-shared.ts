import type { CoreOptions, Image } from "@blazediff/core";

export type DiffFn = (
	a: Image["data"],
	b: Image["data"],
	width: number,
	height: number,
	output: Image["data"] | undefined,
	options: CoreOptions,
) => number | Promise<number>;

export interface ParsedCoreArgs {
	image1: string;
	image2: string;
	outputPath?: string;
	codec?: string;
	threshold?: number;
	alpha?: number;
	aaColor?: [number, number, number];
	diffColor?: [number, number, number];
	diffColorAlt?: [number, number, number];
	includeAA?: boolean;
	diffMask?: boolean;
}

export function parseRGB(colorStr: string): [number, number, number] {
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

export const getCodec = async (codec?: string) => {
	if (!codec || codec === "pngjs") {
		const { default: c } = await import("@blazediff/codec-pngjs");
		return c;
	}
	if (codec === "sharp") {
		const { default: c } = await import("@blazediff/codec-sharp");
		return c;
	}
	if (codec === "jsquash-png") {
		const { default: c } = await import("@blazediff/codec-jsquash-png");
		return c;
	}
	throw new Error(`Unknown codec: ${codec}`);
};

export function parseCoreArgs(
	args: string[],
	printUsage: () => void,
): ParsedCoreArgs {
	if (args.length < 2) {
		console.error("Error: Two image paths are required");
		printUsage();
		process.exit(1);
	}

	const parsed: ParsedCoreArgs = {
		image1: args[0],
		image2: args[1],
	};

	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		const nextArg = args[i + 1];

		switch (arg) {
			case "-o":
			case "--output":
				if (nextArg) {
					parsed.outputPath = nextArg;
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
					parsed.threshold = threshold;
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
					parsed.alpha = alpha;
					i++;
				}
				break;
			case "--aa-color":
				if (nextArg) {
					parsed.aaColor = parseRGB(nextArg);
					i++;
				}
				break;
			case "--diff-color":
				if (nextArg) {
					parsed.diffColor = parseRGB(nextArg);
					i++;
				}
				break;
			case "--diff-color-alt":
				if (nextArg) {
					parsed.diffColorAlt = parseRGB(nextArg);
					i++;
				}
				break;
			case "--include-aa":
				parsed.includeAA = true;
				break;
			case "--diff-mask":
				parsed.diffMask = true;
				break;
			case "--codec":
				if (nextArg) {
					parsed.codec = nextArg;
					i++;
				}
				break;
			default:
				console.error(`Unknown option: ${arg}`);
				printUsage();
				process.exit(1);
		}
	}

	return parsed;
}

export async function runCoreDiff(
	parsed: ParsedCoreArgs,
	diffFn: DiffFn,
): Promise<void> {
	const codec = await getCodec(parsed.codec);

	const [img1, img2] = await Promise.all([
		codec.read(parsed.image1),
		codec.read(parsed.image2),
	]);

	if (img1.width !== img2.width || img1.height !== img2.height) {
		throw new Error(
			`Image dimensions do not match: ${img1.width}x${img1.height} vs ${img2.width}x${img2.height}`,
		);
	}

	let outputData: Uint8Array | undefined;
	if (parsed.outputPath) {
		outputData = new Uint8Array(img1.data.length);
	}

	const coreOptions: CoreOptions = {
		threshold: parsed.threshold,
		alpha: parsed.alpha,
		aaColor: parsed.aaColor,
		diffColor: parsed.diffColor,
		diffColorAlt: parsed.diffColorAlt,
		includeAA: parsed.includeAA,
		diffMask: parsed.diffMask,
	};

	const startTime = performance.now();
	const diffCount = await diffFn(
		img1.data,
		img2.data,
		img1.width,
		img1.height,
		outputData,
		coreOptions,
	);
	const duration = performance.now() - startTime;

	if (diffCount > 0 && parsed.outputPath && outputData) {
		await codec.write(
			{
				data: outputData,
				width: img1.width,
				height: img1.height,
			},
			parsed.outputPath,
		);
	}

	console.log(`completed in: ${duration.toFixed(2)}ms`);
	console.log(`dimensions: ${img1.width}x${img1.height}`);
	console.log(`different pixels: ${diffCount}`);
	console.log(
		`error: ${((diffCount / (img1.width * img1.height)) * 100).toFixed(2)}%`,
	);

	if (diffCount > 0 && outputData && parsed.outputPath) {
		console.log(`diff image: ${parsed.outputPath}`);
	}

	if (diffCount > 0) {
		process.exit(1);
	} else {
		console.log(`Images are identical!`);
		process.exit(0);
	}
}
