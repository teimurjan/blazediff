import blazediff, { type CoreOptions } from "@blazediff/core";
import { type GmsdOptions, gmsd } from "@blazediff/gmsd";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Transformer {
	transform: (input: string | Buffer) => Promise<Image>;
	write: (image: Image, output: string | Buffer) => Promise<void>;
}

export type ComparisonMode = "diff" | "gmsd";

export interface DiffModeOptions {
	outputPath?: string;
	transformer: Transformer;
	mode?: "diff";
	options?: CoreOptions;
}

export interface GmsdModeOptions {
	outputPath?: string;
	transformer: Transformer;
	mode: "gmsd";
	options?: GmsdOptions;
}

export interface DiffModeResult {
	mode: "diff";
	diffCount: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export interface GmsdModeResult {
	mode: "gmsd";
	score: number;
	width: number;
	height: number;
	outputData?: Uint8Array;
	duration: number;
}

export type BlazeDiffBinResult = DiffModeResult | GmsdModeResult;

const isGmsdModeOptions = (
	options: DiffModeOptions | GmsdModeOptions,
): options is GmsdModeOptions => {
	return options.mode === "gmsd";
};

export default async function bin(
	image1Path: string,
	image2Path: string,
	options: GmsdModeOptions,
): Promise<GmsdModeResult>;
export default async function bin(
	image1Path: string,
	image2Path: string,
	options: DiffModeOptions,
): Promise<DiffModeResult>;
export default async function bin(
	image1Path: string,
	image2Path: string,
	options: DiffModeOptions | GmsdModeOptions,
): Promise<DiffModeResult | GmsdModeResult> {
	const [image1, image2] = await Promise.all([
		options.transformer.transform(image1Path),
		options.transformer.transform(image2Path),
	]);

	if (image1.width !== image2.width || image1.height !== image2.height) {
		throw new Error(
			`Image dimensions do not match: ${image1.width}x${image1.height} vs ${image2.width}x${image2.height}`,
		);
	}

	if (isGmsdModeOptions(options)) {
		// GMSD mode - compute similarity score
		let outputData: Uint8Array | undefined;
		if (options.outputPath) {
			outputData = new Uint8Array(image1.data.length);
		}

		const startTime = performance.now();
		const score = gmsd(
			image1.data,
			image2.data,
			outputData,
			image1.width,
			image1.height,
			options.options || {},
		);
		const duration = performance.now() - startTime;

		// Write GMS map if output path is provided
		if (options.outputPath && outputData) {
			await options.transformer.write(
				{
					data: outputData,
					width: image1.width,
					height: image1.height,
				},
				options.outputPath,
			);
		}

		return {
			mode: "gmsd",
			width: image1.width,
			height: image1.height,
			outputData,
			duration,
			score,
		} satisfies GmsdModeResult;
	}

	// Default diff mode
	let outputData: Uint8Array | undefined;
	if (options.outputPath) {
		outputData = new Uint8Array(image1.data.length);
	}

	const startTime = performance.now();
	const diffCount = blazediff(
		image1.data,
		image2.data,
		outputData,
		image1.width,
		image1.height,
		options.options || {},
	);
	const duration = performance.now() - startTime;

	if (diffCount > 0 && options.outputPath && outputData) {
		await options.transformer.write(
			{
				data: outputData,
				width: image1.width,
				height: image1.height,
			},
			options.outputPath,
		);
	}

	return {
		mode: "diff",
		diffCount,
		width: image1.width,
		height: image1.height,
		outputData,
		duration,
	} satisfies DiffModeResult;
}
