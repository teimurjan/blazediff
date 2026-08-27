import init, {
	interpretRgba as wasmInterpretRgba,
} from "../wasm/blazediff_interpret.js";

// Generated bindings are updated in version bump PRs, so keep the source-side
// ABI explicit while this wrapper targets the next generated artifact.
type WasmInterpretRgba = (
	rgbaA: Uint8Array,
	rgbaB: Uint8Array,
	width: number,
	height: number,
	threshold: number,
	antialiasing: boolean,
	outDiff: Uint8Array | undefined,
) => unknown;

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

export interface ChromaStats {
	/** Mean |ΔY| (luminance delta magnitude), normalized to 255. */
	meanAbsDy: number;
	/** Signed mean ΔY. */
	meanDy: number;
	/** Mean |ΔI|. */
	meanAbsDi: number;
	/** Mean |ΔQ|. */
	meanAbsDq: number;
	/** Mean chroma-delta magnitude √(ΔI²+ΔQ²). */
	meanAbsDc: number;
	/** Cosine between the chroma vectors; near 1 = same hues, negative = hue rotation. */
	chromaCos: number;
	/** Mean chroma magnitude (saturation) in the first image. */
	sat1: number;
	/** Mean chroma magnitude in the second image. */
	sat2: number;
	/** Roughness of the chroma-delta field; low = smooth recolor, high = patchy replacement. */
	chromaRough: number;
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
	/** Luminance NCC over the changed pixels; high = structure preserved. */
	luminanceNcc: number;
	/** Signed img2-minus-img1 edge density; positive = structure gained. */
	structureAsymmetry: number;
	/** Normalized RGB distance of changed pixels from local background in the first image. */
	bgDistanceImg1: number;
	/** Same measurement against the second image. */
	bgDistanceImg2: number;
	confidence: number;
}

export interface ChangeRegion {
	bbox: BoundingBox;
	/** Actually-changed pixels inside the region, never map windows. */
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
	chroma: ChromaStats;
}

export interface InterpretResult {
	summary: string;
	/** Actually-changed pixels, on every source. */
	diffCount: number;
	totalRegions: number;
	regions: ChangeRegion[];
	severity: string;
	diffPercentage: number;
	width: number;
	height: number;
}

export interface InterpretOptions {
	/** Color difference threshold (0-1). Lower = stricter. Default: 0.1 */
	threshold?: number;
	/** Exclude anti-aliased pixels. Default: false */
	antialiasing?: boolean;
}

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

let initPromise: Promise<unknown> | undefined;

/**
 * Initialize the wasm module. Safe to call multiple times - subsequent calls
 * return the same promise. By default fetches the bundled
 * `blazediff_interpret_bg.wasm` via the module's import path. Pass a custom
 * `URL`, `Response`, or bytes to load the wasm from a different location (CDN,
 * custom asset pipeline, etc.).
 */
export function initInterpret(input?: WasmInput): Promise<void> {
	if (!initPromise) {
		const arg =
			input === undefined ? undefined : ({ module_or_path: input } as never);
		initPromise = init(arg).then(() => undefined);
	}
	return initPromise as Promise<void>;
}

/**
 * Describe what changed between two RGBA pixel buffers.
 *
 * Both buffers must be `width * height * 4` bytes in RGBA8 order. Decode
 * PNG/JPEG with `createImageBitmap` + `OffscreenCanvas.getImageData()` (or the
 * `ImageDecoder` API) and pass the resulting `Uint8Array` here.
 *
 * Returns the same shape as `@blazediff/interpret-native`: a `summary` string,
 * a `regions[]` array and an overall `severity`.
 *
 * If `output` is provided it must be `width * height * 4` bytes long and the
 * diff visualization is written into it in place.
 */
export function interpret(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options?: InterpretOptions,
): Promise<InterpretResult>;
export async function interpret(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	output?: Uint8Array,
	options: InterpretOptions = {},
): Promise<InterpretResult> {
	await initInterpret();
	return (wasmInterpretRgba as unknown as WasmInterpretRgba)(
		a,
		b,
		width,
		height,
		options.threshold ?? 0.1,
		options.antialiasing ?? false,
		output,
	) as InterpretResult;
}
