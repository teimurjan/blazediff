import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Which member of the structural-similarity family to run.
 *
 * All of them answer "how alike do these look" with one pooled score in 0-1,
 * where 1 is identical. For *where* pixels changed, use `@blazediff/core-native`.
 */
export type SsimMetric =
	| "ssim"
	| "ms-ssim"
	| "hitchhikers-ssim"
	| "perceptual-ssim";

/** Knobs shared by every metric. */
export interface SsimOptions {
	/** Side of the local window. Default: 11 */
	windowSize?: number;
	/** Luminance stability constant: `c1 = (k1·L)²`. Default: 0.01 */
	k1?: number;
	/** Contrast stability constant: `c2 = (k2·L)²`. Default: 0.03 */
	k2?: number;
	/** Sample bit depth, setting `L = 2^bitDepth - 1`. Default: 8 */
	bitDepth?: number;
}

/** How a pyramid's per-scale scores collapse into one number. */
export type PoolingMethod = "product" | "weighted-sum";

/** Knobs specific to `ms-ssim`. */
export interface MsSsimOptions {
	/**
	 * Per-scale weights; the length sets the number of scales.
	 * Default: `[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]`
	 */
	weights?: number[];
	/**
	 * Default: `"product"`. Note that `"product"` yields `NaN` for globally
	 * anticorrelated content (an inverted image); `"weighted-sum"` stays finite.
	 */
	method?: PoolingMethod;
}

/** Knobs specific to `hitchhikers-ssim`. */
export interface HitchhikersOptions {
	/** Distance between window origins. Omit for non-overlapping windows. */
	windowStride?: number;
	/** Pool with `1 - stddev/mean` instead of the plain mean. Default: true */
	covPooling?: boolean;
}

/** Knobs specific to `perceptual-ssim`. */
export interface PerceptualOptions extends MsSsimOptions {
	/** Default: `"gamma-luma"`. Only `"lab"` can see colour. */
	color?: "gamma-luma" | "lab";
	/** Weight on each chroma channel relative to lightness. Default: 0 */
	chromaWeight?: number;
	/**
	 * Extra octaves of downscaling applied to the chroma channels before their
	 * statistics, modelling the eye's lower chroma acuity. Default: 0
	 */
	chromaSubsample?: number;
	/** `"mad"` selects mean-absolute-deviation pooling. Default: `"mean"` */
	pooling?: "mean" | "mad";
	/** λ in the MAD pooling. Default: 1 */
	deviationWeight?: number;
}

export interface CompareOptions extends SsimOptions {
	/** Default: `"ssim"` */
	metric?: SsimMetric;
	/** Score at or above which the images count as identical. Default: 1 */
	minScore?: number;
	/**
	 * Return the local score map alongside the score. Default: false — the map
	 * is one float per window and costs a copy across the binding.
	 */
	returnMap?: boolean;
	msSsim?: MsSsimOptions;
	hitchhikers?: HitchhikersOptions;
	perceptual?: PerceptualOptions;
	/** PNG compression level (0-9) for a rendered map. Default: 0 */
	compression?: number;
	/** JPEG quality (1-100) for a rendered map. Default: 90 */
	quality?: number;
}

/** File path or encoded PNG, JPEG, or QOI bytes. */
export type SsimInput = string | Uint8Array;

/** The local map a score was pooled from. */
export interface SsimMap {
	/** Row-major per-window scores. Present only when `returnMap` is set. */
	map?: Float32Array;
	mapWidth: number;
	mapHeight: number;
}

export type SsimResult =
	| ({
			match: true;
			metric: SsimMetric;
			/** Pooled similarity. 1 means identical. */
			score: number;
	  } & SsimMap)
	| ({
			match: false;
			reason: "score-below-threshold";
			metric: SsimMetric;
			score: number;
			/** Map windows scoring below `minScore`. */
			belowCount: number;
			/** Those windows as a percentage of the map. */
			belowPercentage: number;
	  } & SsimMap)
	| { match: false; reason: "layout-diff" }
	| { match: false; reason: "file-not-exists"; file: string };

/**
 * N-API binding result structure.
 *
 * napi-rs marshals a Rust `Option::None` to `undefined`, so the optional fields
 * are declared optional rather than nullable.
 */
interface NativeResult {
	matchResult: boolean;
	reason?: string;
	metric: SsimMetric;
	score: number;
	belowCount: number;
	belowPercentage: number;
	map?: Float32Array;
	mapWidth: number;
	mapHeight: number;
}

/** N-API binding options structure */
interface NativeOptions {
	metric?: SsimMetric;
	minScore?: number;
	windowSize?: number;
	k1?: number;
	k2?: number;
	bitDepth?: number;
	returnMap?: boolean;
	compression?: number;
	quality?: number;
	msSsim?: MsSsimOptions;
	hitchhikers?: HitchhikersOptions;
	perceptual?: PerceptualOptions;
}

/** Native binding interface */
interface NativeBinding {
	compare(
		basePath: string,
		comparePath: string,
		mapOutput: string | null,
		options: NativeOptions | null,
	): NativeResult;
	compareBuffers(
		base: Uint8Array,
		comparison: Uint8Array,
		mapOutput: string | null,
		options: NativeOptions | null,
	): NativeResult;
	compareRgba(
		base: Uint8Array,
		comparison: Uint8Array,
		width: number,
		height: number,
		options: NativeOptions | null,
	): NativeResult;
	interpret(
		basePath: string,
		comparePath: string,
		options: NativeOptions | null,
		regionFloor?: number,
	): InterpretResult;
	interpretBuffers(
		base: Uint8Array,
		comparison: Uint8Array,
		options: NativeOptions | null,
		regionFloor?: number,
	): InterpretResult;
	renderMap(
		map: Float32Array,
		mapWidth: number,
		mapHeight: number,
		width: number,
		height: number,
	): Buffer;
	metrics(): SsimMetric[];
}

const PLATFORM_PACKAGES: Record<
	string,
	{ packageName: string; packageDir: string }
> = {
	"darwin-arm64": {
		packageName: "@blazediff/ssim-native-darwin-arm64",
		packageDir: "ssim-native-darwin-arm64",
	},
	"darwin-x64": {
		packageName: "@blazediff/ssim-native-darwin-x64",
		packageDir: "ssim-native-darwin-x64",
	},
	"linux-arm64": {
		packageName: "@blazediff/ssim-native-linux-arm64",
		packageDir: "ssim-native-linux-arm64",
	},
	"linux-x64": {
		packageName: "@blazediff/ssim-native-linux-x64",
		packageDir: "ssim-native-linux-x64",
	},
	"win32-arm64": {
		packageName: "@blazediff/ssim-native-win32-arm64",
		packageDir: "ssim-native-win32-arm64",
	},
	"win32-x64": {
		packageName: "@blazediff/ssim-native-win32-x64",
		packageDir: "ssim-native-win32-x64",
	},
};

let nativeBinding: NativeBinding | null = null;
let nativeBindingAttempted = false;

/**
 * Load the platform's N-API binding, or return null if there isn't one.
 *
 * Unlike `@blazediff/core-native` there is no CLI to fall back to: this package
 * ships only the `.node`, so a miss here is fatal for every entry point.
 */
function tryLoadNativeBinding(): NativeBinding | null {
	if (nativeBindingAttempted) {
		return nativeBinding;
	}
	nativeBindingAttempted = true;

	const key = `${os.platform()}-${os.arch()}`;
	const platformInfo = PLATFORM_PACKAGES[key];
	if (!platformInfo) {
		return null;
	}

	const require = createRequire(import.meta.url);

	try {
		const binding = require(platformInfo.packageName) as NativeBinding;
		if (typeof binding?.compare === "function") {
			nativeBinding = binding;
			return binding;
		}
	} catch {
		// Optional dependency missing for this platform; try the sibling below.
	}

	// Sibling package fallback, for monorepo development where the optional
	// dependencies are never installed from the registry.
	try {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const packagesDir = path.resolve(currentDir, "..", "..");
		const nodePath = path.join(
			packagesDir,
			platformInfo.packageDir,
			"blazediff_ssim.node",
		);
		if (existsSync(nodePath)) {
			const binding = require(nodePath) as NativeBinding;
			if (typeof binding?.compare === "function") {
				nativeBinding = binding;
				return binding;
			}
		}
	} catch {
		// Fallback also failed.
	}

	return null;
}

function requireBinding(): NativeBinding {
	const binding = tryLoadNativeBinding();
	if (binding) return binding;

	const key = `${os.platform()}-${os.arch()}`;
	if (!PLATFORM_PACKAGES[key]) {
		throw new Error(
			`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`,
		);
	}
	throw new Error(
		`Platform package ${PLATFORM_PACKAGES[key].packageName} is not installed. ` +
			`This usually means the optional dependency wasn't installed for your platform. ` +
			`Try reinstalling with: npm install @blazediff/ssim-native`,
	);
}

function toNativeOptions(options?: CompareOptions): NativeOptions {
	return {
		metric: options?.metric,
		minScore: options?.minScore,
		windowSize: options?.windowSize,
		k1: options?.k1,
		k2: options?.k2,
		bitDepth: options?.bitDepth,
		returnMap: options?.returnMap,
		compression: options?.compression,
		quality: options?.quality,
		msSsim: options?.msSsim,
		hitchhikers: options?.hitchhikers,
		perceptual: options?.perceptual,
	};
}

function convertResult(result: NativeResult): SsimResult {
	const map = result.map ?? undefined;
	const { metric, score, mapWidth, mapHeight } = result;

	if (result.matchResult) {
		return { match: true, metric, score, map, mapWidth, mapHeight };
	}

	return {
		match: false,
		reason: "score-below-threshold",
		metric,
		score,
		belowCount: result.belowCount,
		belowPercentage: result.belowPercentage,
		map,
		mapWidth,
		mapHeight,
	};
}

/**
 * The metrics reject a mismatched pair, which is a layout difference rather
 * than a similarity one — there is no meaningful score for images of different
 * sizes.
 */
function isLayoutError(message: string): boolean {
	return message.includes("Image sizes do not match");
}

function detectMissingFile(
	error: string,
	basePath: string,
	comparePath: string,
): string | null {
	if (!/Failed to load images:.*(?:No such file|not found)/i.test(error)) {
		return null;
	}
	if (error.includes(basePath)) return basePath;
	if (error.includes(comparePath)) return comparePath;
	return basePath; // default to base if we can't tell
}

/**
 * Compare two encoded images (PNG, JPEG, or QOI) with a structural-similarity
 * metric, and optionally render the local score map to `mapOutput`.
 *
 * Inputs must both be file paths or both be encoded byte arrays. Node.js Buffer
 * values are Uint8Array instances and can be passed directly.
 *
 * @example
 * ```ts
 * const result = await compare("expected.png", "actual.png", "map.png", {
 *   metric: "ms-ssim",
 *   minScore: 0.99,
 * });
 *
 * if (result.match) {
 *   console.log(`identical enough: ${result.score}`);
 * } else if (result.reason === "score-below-threshold") {
 *   console.log(`scored ${result.score}, ${result.belowCount} windows below`);
 * }
 * ```
 */
export async function compare(
	base: SsimInput,
	comparison: SsimInput,
	mapOutput?: string,
	options?: CompareOptions,
): Promise<SsimResult> {
	const baseIsPath = typeof base === "string";
	const comparisonIsPath = typeof comparison === "string";
	if (baseIsPath !== comparisonIsPath) {
		throw new TypeError(
			"Image inputs must both be file paths or both be encoded byte arrays",
		);
	}

	const binding = requireBinding();
	try {
		const result =
			baseIsPath && comparisonIsPath
				? binding.compare(
						base,
						comparison,
						mapOutput ?? null,
						toNativeOptions(options),
					)
				: binding.compareBuffers(
						base as Uint8Array,
						comparison as Uint8Array,
						mapOutput ?? null,
						toNativeOptions(options),
					);
		return convertResult(result);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (isLayoutError(message)) {
			return { match: false, reason: "layout-diff" };
		}
		if (baseIsPath && comparisonIsPath) {
			const missingFile = detectMissingFile(message, base, comparison);
			if (missingFile) {
				return { match: false, reason: "file-not-exists", file: missingFile };
			}
		}
		throw err;
	}
}

/**
 * Both buffers are read at the same `width` x `height`, so unlike
 * {@link compare} there is no layout-difference case to report — a buffer that
 * cannot hold that many pixels throws instead.
 */
function compareRaw(
	metric: SsimMetric,
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): SsimResult {
	return convertResult(
		requireBinding().compareRgba(base, comparison, width, height, {
			...toNativeOptions(options),
			metric,
		}),
	);
}

/**
 * Gaussian-windowed single-scale SSIM over raw RGBA8 buffers, with the
 * automatic downsampling to ~256px on the short edge that MATLAB's `ssim.m`
 * does.
 */
export function ssim(
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): SsimResult {
	return compareRaw("ssim", base, comparison, width, height, options);
}

/**
 * SSIM pooled across a 5-octave dyadic pyramid, per `msssim.m`.
 *
 * Needs at least 176px on the short edge for the default five scales.
 */
export function msSsim(
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): SsimResult {
	return compareRaw("ms-ssim", base, comparison, width, height, options);
}

/**
 * Box windows over five integral images, pooled by coefficient of variation
 * (Venkataramanan et al. 2021). Every window sum is an O(1) summed-area-table
 * lookup instead of ten 11-tap convolutions.
 */
export function hitchhikersSsim(
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): SsimResult {
	return compareRaw(
		"hitchhikers-ssim",
		base,
		comparison,
		width,
		height,
		options,
	);
}

/**
 * The tunable variant: CIE L*a*b*, chroma weighting, chroma subsampling and
 * mean-absolute-deviation pooling, each an independent knob.
 *
 * With no `perceptual` options it reduces bit-identically to {@link msSsim}.
 */
export function perceptualSsim(
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): SsimResult {
	return compareRaw(
		"perceptual-ssim",
		base,
		comparison,
		width,
		height,
		options,
	);
}

/**
 * Paint a local score map into an RGBA8 buffer as grayscale, dark where the
 * local score is low. Nearest-neighbour stretched to `width` x `height`.
 */
export function renderMap(
	map: Float32Array,
	mapWidth: number,
	mapHeight: number,
	width: number,
	height: number,
): Uint8Array {
	return requireBinding().renderMap(map, mapWidth, mapHeight, width, height);
}

/** Every metric name this build accepts. */
export function metrics(): SsimMetric[] {
	return requireBinding().metrics();
}

/**
 * Check if the native N-API binding is available.
 * Returns true if the native module loaded successfully.
 */
export function hasNativeBinding(): boolean {
	return tryLoadNativeBinding() !== null;
}

// ─── Interpret ───────────────────────────────────────────────────────────────

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

export interface InterpretOptions extends CompareOptions {
	/**
	 * Score at or below which a map window counts as changed when deriving
	 * regions. Distinct from `minScore`, which decides whether the pair matches
	 * at all. Default: 0.99
	 */
	regionFloor?: number;
}

/**
 * Describe *what* changed, using the local score map to find *where*.
 *
 * The metric locates the regions and `blazediff-interpret` classifies them —
 * change type, shape, position, colour delta, confidence. The map's grid is
 * coarse, so the boxes are blocky, but every box is refined against the source
 * pixels before anything is measured; `diffCount` is a count of actually
 * changed pixels, never of windows.
 *
 * @example
 * ```ts
 * const result = await interpret("expected.png", "actual.png", { metric: "ms-ssim" });
 * console.log(result.summary);
 * for (const region of result.regions) {
 *   console.log(`${region.position}: ${region.changeType}`);
 * }
 * ```
 */
export async function interpret(
	base: SsimInput,
	comparison: SsimInput,
	options?: InterpretOptions,
): Promise<InterpretResult> {
	const baseIsPath = typeof base === "string";
	const comparisonIsPath = typeof comparison === "string";
	if (baseIsPath !== comparisonIsPath) {
		throw new TypeError(
			"Image inputs must both be file paths or both be encoded byte arrays",
		);
	}

	const binding = requireBinding();
	const native = toNativeOptions(options);
	const floor = options?.regionFloor;

	return baseIsPath && comparisonIsPath
		? binding.interpret(base, comparison, native, floor)
		: binding.interpretBuffers(
				base as Uint8Array,
				comparison as Uint8Array,
				native,
				floor,
			);
}
