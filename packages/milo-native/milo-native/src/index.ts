import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CompareOptions {
	/**
	 * Raw error at or below which the images count as identical. Default: 0,
	 * which only identical images satisfy.
	 */
	maxError?: number;
	/**
	 * Threads to spread the work over. Default: every core the OS reports.
	 * The result is the same whatever the count.
	 */
	threads?: number;
	/**
	 * Return the visibility mask and per-pixel error map alongside the scores.
	 * Default: false. They are one float per pixel each and cost a copy across
	 * the binding.
	 */
	returnMaps?: boolean;
	/** PNG compression level (0-9) for a rendered error map. Default: 0 */
	compression?: number;
	/** JPEG quality (1-100) for a rendered error map. Default: 90 */
	quality?: number;
}

/** File path or encoded PNG, JPEG, or QOI bytes. */
export type MiloInput = string | Uint8Array;

/** The per-pixel maps a score was pooled from. */
export interface MiloMaps {
	/**
	 * Row-major visibility mask, one value per pixel in (0, 4). Present only
	 * when `returnMaps` is set.
	 */
	mask?: Float32Array;
	/**
	 * Row-major perceived error, one value per pixel in 0..1. Present only
	 * when `returnMaps` is set.
	 */
	errorMap?: Float32Array;
	width: number;
	height: number;
}

/** The two scores every comparison produces. */
export interface MiloScores {
	/** Masked mean absolute error. Zero means identical. This is the metric. */
	rawError: number;
	/**
	 * `rawError` on KADID-10k's 1-5 mean-opinion-score scale, through the
	 * metric's learned calibration. About 4.35 for identical images, lower with
	 * visible damage. Threshold on `rawError`, not on this.
	 */
	mos: number;
}

export type MiloResult =
	| ({ match: true } & MiloScores & MiloMaps)
	| ({ match: false; reason: "error-above-threshold" } & MiloScores & MiloMaps)
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
	rawError: number;
	mos: number;
	mask?: Float32Array;
	errorMap?: Float32Array;
	width: number;
	height: number;
}

/** N-API binding options structure */
interface NativeOptions {
	maxError?: number;
	threads?: number;
	returnMaps?: boolean;
	compression?: number;
	quality?: number;
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
	renderMap(map: Float32Array, width: number, height: number): Buffer;
}

const PLATFORM_PACKAGES: Record<
	string,
	{ packageName: string; packageDir: string }
> = {
	"darwin-arm64": {
		packageName: "@blazediff/milo-native-darwin-arm64",
		packageDir: "milo-native-darwin-arm64",
	},
	"darwin-x64": {
		packageName: "@blazediff/milo-native-darwin-x64",
		packageDir: "milo-native-darwin-x64",
	},
	"linux-arm64": {
		packageName: "@blazediff/milo-native-linux-arm64",
		packageDir: "milo-native-linux-arm64",
	},
	"linux-x64": {
		packageName: "@blazediff/milo-native-linux-x64",
		packageDir: "milo-native-linux-x64",
	},
	"win32-arm64": {
		packageName: "@blazediff/milo-native-win32-arm64",
		packageDir: "milo-native-win32-arm64",
	},
	"win32-x64": {
		packageName: "@blazediff/milo-native-win32-x64",
		packageDir: "milo-native-win32-x64",
	},
};

let nativeBinding: NativeBinding | null = null;
let nativeBindingAttempted = false;

/**
 * Load the platform's N-API binding, or return null if there isn't one.
 *
 * There is no CLI to fall back to: this package ships only the `.node`, so a
 * miss here is fatal for every entry point.
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
			"blazediff_milo.node",
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
			`Try reinstalling with: npm install @blazediff/milo-native`,
	);
}

function toNativeOptions(options?: CompareOptions): NativeOptions {
	return {
		maxError: options?.maxError,
		threads: options?.threads,
		returnMaps: options?.returnMaps,
		compression: options?.compression,
		quality: options?.quality,
	};
}

function convertResult(result: NativeResult): MiloResult {
	const { rawError, mos, width, height } = result;
	const maps = {
		mask: result.mask ?? undefined,
		errorMap: result.errorMap ?? undefined,
		width,
		height,
	};

	if (result.matchResult) {
		return { match: true, rawError, mos, ...maps };
	}

	return {
		match: false,
		reason: "error-above-threshold",
		rawError,
		mos,
		...maps,
	};
}

/**
 * The metric rejects a mismatched pair, which is a layout difference rather
 * than a quality one: there is no meaningful score for images of different
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
 * Score how visibly `comparison` differs from `base` with MILO, and optionally
 * render the per-pixel error map to `mapOutput`.
 *
 * Inputs must both be file paths or both be encoded byte arrays (PNG, JPEG or
 * QOI). Node.js Buffer values are Uint8Array instances and can be passed
 * directly. Images must be at least 16px on each side.
 *
 * @example
 * ```ts
 * const result = await compare("expected.png", "actual.png", "map.png", {
 *   maxError: 0.001,
 * });
 *
 * if (result.match) {
 *   console.log(`not visibly different: ${result.rawError}`);
 * } else if (result.reason === "error-above-threshold") {
 *   console.log(`raw error ${result.rawError}, MOS ${result.mos.toFixed(2)}`);
 * }
 * ```
 */
export async function compare(
	base: MiloInput,
	comparison: MiloInput,
	mapOutput?: string,
	options?: CompareOptions,
): Promise<MiloResult> {
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
 * MILO over raw RGBA8 buffers, synchronously. Both are read at the same
 * `width` x `height`, so unlike {@link compare} there is no layout-difference
 * case to report; a buffer that cannot hold that many pixels throws instead.
 */
export function milo(
	base: Uint8Array,
	comparison: Uint8Array,
	width: number,
	height: number,
	options?: CompareOptions,
): MiloResult {
	return convertResult(
		requireBinding().compareRgba(
			base,
			comparison,
			width,
			height,
			toNativeOptions(options),
		),
	);
}

/**
 * Paint a per-pixel map (the `errorMap` or `mask` of a result) into an RGBA8
 * buffer as grayscale, bright where the value is high. Values are clamped to
 * 0..1, so a mask, which runs to 4, saturates.
 */
export function renderMap(
	map: Float32Array,
	width: number,
	height: number,
): Uint8Array {
	return requireBinding().renderMap(map, width, height);
}

/**
 * Check if the native N-API binding is available.
 * Returns true if the native module loaded successfully.
 */
export function hasNativeBinding(): boolean {
	return tryLoadNativeBinding() !== null;
}
