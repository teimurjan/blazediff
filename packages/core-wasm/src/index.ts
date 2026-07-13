import init, {
	diffRgba as wasmDiffRgba,
	interpretRgba as wasmInterpretRgba,
} from "../wasm/blazediff.js";

// Generated bindings are updated in version bump PRs, so keep the source-side
// ABI explicit while this wrapper targets the next generated artifact.
type WasmDiffRgba = (
	rgbaA: Uint8Array,
	rgbaB: Uint8Array,
	width: number,
	height: number,
	threshold: number,
	includeAA: boolean,
	diffMask: boolean,
	diffColorAlt: Uint8Array | undefined,
	outDiff: Uint8Array | undefined,
) => number;

type WasmInterpretRgba = (
	rgbaA: Uint8Array,
	rgbaB: Uint8Array,
	width: number,
	height: number,
	threshold: number,
	includeAA: boolean,
	diffMask: boolean,
	diffColorAlt: Uint8Array | undefined,
	outDiff: Uint8Array | undefined,
) => unknown;

export interface DiffOptions {
	/** Color difference threshold (0-1). Lower = stricter. Default: 0.1 */
	threshold?: number;
	/** Count anti-aliased pixels as differences. Default: false */
	includeAA?: boolean;
	/** Render output with transparent background instead of grayscale base. Default: false */
	diffMask?: boolean;
	/** Alternative RGB color for darkening differences. Default: diff color */
	diffColorAlt?: [number, number, number];
}

export interface InterpretedDiffOptions extends DiffOptions {
	/** Return structured interpretation from the same diff pass. */
	interpret: true;
}

export interface InterpretOptions {
	/** Color difference threshold (0-1). Lower = stricter. Default: 0.1 */
	threshold?: number;
	/** Count anti-aliased pixels as differences. Default: false */
	includeAA?: boolean;
}

export interface BoundingBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ShapeStats {
	fillRatio: number;
	borderRatio: number;
	innerFillRatio: number;
	centerDensity: number;
	rowOccupancy: number;
	colOccupancy: number;
}

export interface ColorDeltaStats {
	meanDelta: number;
	maxDelta: number;
	deltaStddev: number;
}

export interface GradientStats {
	edgeScore: number;
	edgeScoreImg2: number;
	edgeCorrelation: number;
}

export interface ClassificationSignals {
	blendsWithBgInImg1: boolean;
	blendsWithBgInImg2: boolean;
	lowColorDelta: boolean;
	lowEdgeChange: boolean;
	denseFill: boolean;
	sparseFill: boolean;
	tinyRegion: boolean;
	edgesCorrelated: boolean;
	confidence: number;
}

export interface ChangeRegion {
	bbox: BoundingBox;
	pixelCount: number;
	percentage: number;
	position: string;
	shape: string;
	shapeStats: ShapeStats;
	changeType: string;
	signals: ClassificationSignals;
	confidence: number;
	colorDelta: ColorDeltaStats;
	gradient: GradientStats;
}

export interface InterpretResult {
	summary: string;
	diffCount: number;
	totalRegions: number;
	regions: ChangeRegion[];
	severity: string;
	diffPercentage: number;
	width: number;
	height: number;
}

export type DiffResult =
	| { match: true; interpretation: InterpretResult }
	| {
			match: false;
			reason: "pixel-diff";
			diffCount: number;
			diffPercentage: number;
			interpretation: InterpretResult;
	  };

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

function toWasmRgb(
	color: [number, number, number] | undefined,
): Uint8Array | undefined {
	if (!color) return undefined;
	if (
		color.length !== 3 ||
		color.some(
			(channel) => !Number.isInteger(channel) || channel < 0 || channel > 255,
		)
	) {
		throw new RangeError(
			"diffColorAlt must contain three integer RGB channels",
		);
	}
	return Uint8Array.from(color);
}

function toDiffResult(interpretation: InterpretResult): DiffResult {
	if (interpretation.diffCount === 0) {
		return { match: true, interpretation };
	}
	return {
		match: false,
		reason: "pixel-diff",
		diffCount: interpretation.diffCount,
		diffPercentage: interpretation.diffPercentage,
		interpretation,
	};
}

/**
 * Initialize the wasm module. Safe to call multiple times - subsequent calls
 * return the same promise. By default fetches the bundled `blazediff_bg.wasm`
 * via the module's import path. Pass a custom `URL`, `Response`, or bytes to
 * load the wasm from a different location (CDN, custom asset pipeline, etc.).
 */
export function initBlazediff(input?: WasmInput): Promise<void> {
	if (!initPromise) {
		const arg =
			input === undefined ? undefined : ({ module_or_path: input } as never);
		initPromise = init(arg).then(() => undefined);
	}
	return initPromise as Promise<void>;
}

/**
 * Compare two RGBA pixel buffers and return the number of differing pixels.
 *
 * Both buffers must be `width * height * 4` bytes in RGBA8 order. Decode
 * PNG/JPEG with `createImageBitmap` + `OffscreenCanvas.getImageData()` (or
 * the `ImageDecoder` API) and pass the resulting `Uint8Array` here.
 *
 * If `output` is provided it must be `width * height * 4` bytes long and the
 * diff visualization is written into it in place. Set `interpret: true` to
 * return structured interpretation from the same diff pass.
 */
export function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output: Uint8Array | undefined,
	options: InterpretedDiffOptions,
): Promise<DiffResult>;
export function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options?: DiffOptions & { interpret?: false },
): Promise<number>;
export function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options?: DiffOptions & { interpret?: boolean },
): Promise<number | DiffResult>;
export async function diff(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options: DiffOptions & { interpret?: boolean } = {},
): Promise<number | DiffResult> {
	await initBlazediff();
	if (!options.interpret) {
		return (wasmDiffRgba as unknown as WasmDiffRgba)(
			a,
			b,
			width,
			height,
			options.threshold ?? 0.1,
			options.includeAA ?? false,
			options.diffMask ?? false,
			toWasmRgb(options.diffColorAlt),
			output,
		);
	}

	const interpretation = (wasmInterpretRgba as unknown as WasmInterpretRgba)(
		a,
		b,
		width,
		height,
		options.threshold ?? 0.1,
		options.includeAA ?? false,
		options.diffMask ?? false,
		toWasmRgb(options.diffColorAlt),
		output,
	) as InterpretResult;

	return toDiffResult(interpretation);
}

/**
 * Interpret the diff between two RGBA pixel buffers into structured change
 * regions - what changed, where, and how much. Returns the same shape as the
 * native `@blazediff/core-native` `interpret`, with semantic change types,
 * spatial positions, and severity.
 *
 * Both buffers must be `width * height * 4` bytes in RGBA8 order. Decode
 * PNG/JPEG with `createImageBitmap` + `OffscreenCanvas.getImageData()` (or the
 * `ImageDecoder` API) and pass the resulting `Uint8Array` here.
 */
export async function interpret(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	options: InterpretOptions = {},
): Promise<InterpretResult> {
	const result = await diff(a, b, width, height, undefined, {
		...options,
		interpret: true,
	});
	return result.interpretation;
}
