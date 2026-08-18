import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * How the changed regions are located before they are classified.
 *
 * `pixel` runs a per-pixel diff, so the regions are exact. The rest run a
 * structural-similarity metric and threshold its local map, so the regions are
 * as coarse as that map's grid — but the statistics derived from them are not,
 * because every region is refined against the source pixels before it is
 * measured.
 */
export type RegionSource = "pixel" | "ssim" | "ms-ssim" | "hitchhikers-ssim";

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
	/** How to locate the regions. Default: "pixel" */
	source?: RegionSource;
	/** Color difference threshold (0.0-1.0). `pixel` only. Default: 0.1 */
	threshold?: number;
	/** Exclude anti-aliased pixels. `pixel` only. Default: false */
	antialiasing?: boolean;
	/** PNG compression level (0-9) for a written diff image. Default: 0 */
	compression?: number;
	/** JPEG quality (1-100) for a written diff image. Default: 90 */
	quality?: number;
	/** Local window size for the metric sources. Default: 11 */
	windowSize?: number;
	/**
	 * Score at or below which a map window counts as changed. Metric sources
	 * only; distinct from any match threshold. Default: 0.99
	 */
	regionFloor?: number;
}

/** File path or encoded PNG, JPEG, or QOI bytes. */
export type InterpretInput = string | Uint8Array;

interface NativeDiffOptions {
	threshold?: number;
	antialiasing?: boolean;
	compression?: number;
	quality?: number;
}

interface NativeSsimOptions {
	metric?: string;
	windowSize?: number;
	regionFloor?: number;
}

interface NativeBinding {
	interpretImages(
		basePath: string,
		comparePath: string,
		diffOutput: string | null,
		options: NativeDiffOptions | null,
	): InterpretResult;
	interpretBuffers(
		base: Uint8Array,
		comparison: Uint8Array,
		options: NativeDiffOptions | null,
	): InterpretResult;
	interpretSsim(
		basePath: string,
		comparePath: string,
		options: NativeSsimOptions | null,
	): InterpretResult;
	interpretRegions(
		basePath: string,
		comparePath: string,
		regions: BoundingBox[],
	): InterpretResult;
}

const PLATFORM_PACKAGES: Record<
	string,
	{ packageName: string; packageDir: string }
> = {
	"darwin-arm64": {
		packageName: "@blazediff/interpret-native-darwin-arm64",
		packageDir: "interpret-native-darwin-arm64",
	},
	"darwin-x64": {
		packageName: "@blazediff/interpret-native-darwin-x64",
		packageDir: "interpret-native-darwin-x64",
	},
	"linux-arm64": {
		packageName: "@blazediff/interpret-native-linux-arm64",
		packageDir: "interpret-native-linux-arm64",
	},
	"linux-x64": {
		packageName: "@blazediff/interpret-native-linux-x64",
		packageDir: "interpret-native-linux-x64",
	},
	"win32-arm64": {
		packageName: "@blazediff/interpret-native-win32-arm64",
		packageDir: "interpret-native-win32-arm64",
	},
	"win32-x64": {
		packageName: "@blazediff/interpret-native-win32-x64",
		packageDir: "interpret-native-win32-x64",
	},
};

let nativeBinding: NativeBinding | null = null;
let nativeBindingAttempted = false;

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

	// createRequire rejects a non-file URL, which is what `import.meta.url` is
	// for a JSR consumer importing this over https. That is "no native binding
	// here", not a crash: `hasNativeBinding()` promises a boolean.
	let require: ReturnType<typeof createRequire>;
	try {
		require = createRequire(import.meta.url);
	} catch {
		return null;
	}

	try {
		const binding = require(platformInfo.packageName) as NativeBinding;
		if (typeof binding?.interpretImages === "function") {
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
			"blazediff_interpret.node",
		);
		if (existsSync(nodePath)) {
			const binding = require(nodePath) as NativeBinding;
			if (typeof binding?.interpretImages === "function") {
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
			`Try reinstalling with: npm install @blazediff/interpret-native`,
	);
}

/**
 * Describe what changed between two images — what, where, and how much.
 *
 * The default `pixel` source runs a per-pixel diff, so regions are exact. The
 * metric sources locate regions by thresholding a structural-similarity map;
 * their boxes are as coarse as that map's grid, but `pixelCount` and the colour
 * and shape statistics stay per-pixel because each box is refined against the
 * source pixels first.
 *
 * @example
 * ```ts
 * const result = await interpret("expected.png", "actual.png");
 * console.log(result.summary);
 * for (const region of result.regions) {
 *   console.log(`${region.position}: ${region.changeType} (${region.pixelCount}px)`);
 * }
 *
 * // Locate the regions with MS-SSIM instead of a pixel diff.
 * const loose = await interpret("expected.png", "actual.png", undefined, {
 *   source: "ms-ssim",
 * });
 * ```
 */
export async function interpret(
	base: InterpretInput,
	comparison: InterpretInput,
	diffOutput?: string,
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
	const source = options?.source ?? "pixel";

	// Only the pixel source over file paths produces a visualization — a metric
	// source has no diff image to write and the buffer entry point has nowhere
	// to write one. Accepting the path and dropping it would leave the caller
	// waiting on a file that never appears.
	if (diffOutput !== undefined && (source !== "pixel" || !baseIsPath)) {
		throw new TypeError(
			'A diff visualization is only written by the "pixel" source on file-path inputs',
		);
	}

	if (source !== "pixel") {
		if (!baseIsPath || !comparisonIsPath) {
			throw new TypeError(
				"The metric sources require file paths; pass encoded buffers only with the pixel source",
			);
		}
		return binding.interpretSsim(base, comparison, {
			metric: source,
			windowSize: options?.windowSize,
			regionFloor: options?.regionFloor,
		});
	}

	const diffOptions: NativeDiffOptions = {
		threshold: options?.threshold,
		antialiasing: options?.antialiasing,
		compression: options?.compression,
		quality: options?.quality,
	};

	return baseIsPath && comparisonIsPath
		? binding.interpretImages(base, comparison, diffOutput ?? null, diffOptions)
		: binding.interpretBuffers(
				base as Uint8Array,
				comparison as Uint8Array,
				diffOptions,
			);
}

/**
 * Interpret regions you already know about, skipping the search entirely.
 *
 * Use this when something else has already located the change — DOM rectangles
 * from a layout pass, a crop list, or boxes from your own comparison. Boxes may
 * be coarse; each is refined against the source pixels before it is measured. A
 * box outside the image is rejected rather than read out of bounds.
 */
export async function interpretRegions(
	base: string,
	comparison: string,
	regions: BoundingBox[],
): Promise<InterpretResult> {
	return requireBinding().interpretRegions(base, comparison, regions);
}

/**
 * Check if the native N-API binding is available.
 * Returns true if the native module loaded successfully.
 */
export function hasNativeBinding(): boolean {
	return tryLoadNativeBinding() !== null;
}
