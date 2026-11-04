import type {
	DiffOptions,
	DiffResult,
	Image,
	Metric,
	RenderOptions,
	Rgb,
} from "@blazediff/core";

export type DiffFn = (
	a: Image,
	b: Image,
	options: DiffOptions,
) => DiffResult | Promise<DiffResult>;

/** Flags shared by `core`, `core-wasm` and `core-native`; the same names as the Rust CLI. */
export interface ParsedCoreArgs {
	image1: string;
	image2: string;
	outputPath?: string;
	maskPath?: string;
	json: boolean;
	codec?: string;
	compression?: number;
	quality?: number;
	options: Omit<DiffOptions, "output" | "mask">;
}

export const SHARED_FLAGS = `  -o, --output <path>       Output path for the diff image
  -t, --threshold <num>     Matching threshold (0 to 1, default: 0.1)
  --no-antialiasing         Count anti-aliased pixels as differences
  --metric <name>           Color metric: yiq (default) or oklab (pixelmatch 8)
  --mask <path>             Image whose non-black pixels are skipped
  --window <n>              Also report the n×n window with the most differences
  -a, --alpha <num>         Opacity of the original image in the diff (default: 0.1)
  --diff-color <r,g,b>      Color for different pixels (default: 255,0,0)
  --diff-color-alt <r,g,b>  Color for pixels that get darker (default: diff color)
  --aa-color <r,g,b>        Color for anti-aliased pixels (default: 255,255,0)
  --background <name>       faded (default) or transparent
  --json                    Print the result as JSON`;

export function parseMetric(value: string): Metric {
	if (value === "yiq" || value === "oklab") return value;
	throw new Error(`Invalid metric: ${value}. Expected yiq or oklab`);
}

function parseWindow(value: string): number {
	const window = Number(value);
	if (!Number.isInteger(window) || window < 1) {
		throw new Error(`Invalid window: ${value}. Must be a positive integer`);
	}
	return window;
}

function parseBackground(value: string): RenderOptions["background"] {
	if (value === "faded" || value === "transparent") return value;
	throw new Error(
		`Invalid background: ${value}. Expected faded or transparent`,
	);
}

function parseUnit(name: string, value: string): number {
	const number = Number.parseFloat(value);
	if (Number.isNaN(number) || number < 0 || number > 1) {
		throw new Error(`Invalid ${name}: ${value}. Must be between 0 and 1`);
	}
	return number;
}

function parseIntIn(name: string, value: string, min: number, max: number) {
	const number = Number.parseInt(value, 10);
	if (Number.isNaN(number) || number < min || number > max) {
		throw new Error(
			`Invalid ${name}: ${value}. Must be between ${min} and ${max}`,
		);
	}
	return number;
}

export function parseRGB(colorStr: string): Rgb {
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

/** One byte per pixel: 1 where the mask image is not black. */
export async function loadMask(
	path: string,
	codecName?: string,
): Promise<Uint8Array> {
	const codec = await getCodec(codecName);
	const { data, width, height } = await codec.read(path);
	const mask = new Uint8Array(width * height);
	for (let i = 0; i < mask.length; i++) {
		mask[i] = data[i * 4] | data[i * 4 + 1] | data[i * 4 + 2] ? 1 : 0;
	}
	return mask;
}

/**
 * Parses `<image1> <image2> [flags]`. `native` swaps `--codec` for the
 * encoder flags `--compression` and `--quality`.
 */
export function parseCoreArgs(
	args: string[],
	printUsage: () => void,
	{ native = false } = {},
): ParsedCoreArgs {
	if (args.length < 2) {
		console.error("Error: Two image paths are required");
		printUsage();
		process.exit(2);
	}

	const parsed: ParsedCoreArgs = {
		image1: args[0],
		image2: args[1],
		json: false,
		options: {},
	};
	const render: RenderOptions = {};

	for (let i = 2; i < args.length; i++) {
		const arg = args[i];
		const takeValue = (): string => {
			const value = args[++i];
			if (value === undefined) throw new Error(`${arg} needs a value`);
			return value;
		};

		switch (arg) {
			case "-o":
			case "--output":
				parsed.outputPath = takeValue();
				break;
			case "-t":
			case "--threshold":
				parsed.options.threshold = parseUnit("threshold", takeValue());
				break;
			case "--antialiasing":
				parsed.options.antialiasing = true;
				break;
			case "--no-antialiasing":
				parsed.options.antialiasing = false;
				break;
			case "--metric":
				parsed.options.metric = parseMetric(takeValue());
				break;
			case "--mask":
				parsed.maskPath = takeValue();
				break;
			case "--window":
				parsed.options.window = parseWindow(takeValue());
				break;
			case "-a":
			case "--alpha":
				render.alpha = parseUnit("alpha", takeValue());
				break;
			case "--diff-color":
				render.diffColor = parseRGB(takeValue());
				break;
			case "--diff-color-alt":
				render.diffColorAlt = parseRGB(takeValue());
				break;
			case "--aa-color":
				render.aaColor = parseRGB(takeValue());
				break;
			case "--background":
				render.background = parseBackground(takeValue());
				break;
			case "--json":
				parsed.json = true;
				break;
			case "--codec":
				if (native) throw new Error("--codec is not supported by core-native");
				parsed.codec = takeValue();
				break;
			case "--compression":
				if (!native) throw new Error(`${arg} is only supported by core-native`);
				parsed.compression = parseIntIn("compression", takeValue(), 0, 9);
				break;
			case "--quality":
				if (!native) throw new Error(`${arg} is only supported by core-native`);
				parsed.quality = parseIntIn("quality", takeValue(), 1, 100);
				break;
			default:
				console.error(`Unknown option: ${arg}`);
				printUsage();
				process.exit(2);
		}
	}

	if (Object.keys(render).length > 0) parsed.options.render = render;
	return parsed;
}

/** Prints a diff result and exits: 0 identical, 1 differs or sizes differ. */
export function reportResult(
	result: DiffResult,
	{
		json,
		outputPath,
		duration,
	}: { json: boolean; outputPath?: string; duration: number },
): never {
	if (json) {
		console.log(JSON.stringify(result));
	} else if (result.kind === "dimension-mismatch") {
		const { a, b } = result;
		console.log(
			`Image dimensions do not match: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
		);
	} else {
		console.log(`completed in: ${duration.toFixed(2)}ms`);
		console.log(`different pixels: ${result.count}`);
		console.log(`error: ${result.percentage.toFixed(2)}%`);
		if (result.window) {
			const { x, y, count } = result.window;
			console.log(`busiest window: ${count} pixels at ${x},${y}`);
		}
		if (!result.identical && outputPath)
			console.log(`diff image: ${outputPath}`);
		if (result.identical) console.log("Images are identical!");
	}
	process.exit(result.kind === "compared" && result.identical ? 0 : 1);
}

/** Decodes both images with the chosen codec, diffs them and reports. */
export async function runCoreDiff(
	parsed: ParsedCoreArgs,
	diffFn: DiffFn,
): Promise<never> {
	const codec = await getCodec(parsed.codec);
	const [a, b, mask] = await Promise.all([
		codec.read(parsed.image1),
		codec.read(parsed.image2),
		parsed.maskPath ? loadMask(parsed.maskPath, parsed.codec) : undefined,
	]);
	const output: Image | undefined = parsed.outputPath
		? { data: new Uint8Array(a.data.length), width: a.width, height: a.height }
		: undefined;

	const startTime = performance.now();
	const result = await diffFn(a, b, { ...parsed.options, mask, output });
	const duration = performance.now() - startTime;

	if (
		result.kind === "compared" &&
		!result.identical &&
		output &&
		parsed.outputPath
	) {
		await codec.write(output, parsed.outputPath);
	}
	return reportResult(result, {
		json: parsed.json,
		outputPath: parsed.outputPath,
		duration,
	});
}
