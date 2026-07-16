import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface BlazeDiffOptions {
	/** Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1 */
	threshold?: number;
	/** Enable anti-aliasing detection to exclude AA pixels from diff count */
	antialiasing?: boolean;
	/** Output only differences with transparent background */
	diffMask?: boolean;
	/** Alternative RGB color for darkening differences. Default: diff color */
	diffColorAlt?: [number, number, number];
	/** PNG compression level (0-9, 0=fastest/largest, 9=slowest/smallest) */
	compression?: number;
	/** JPEG quality (1-100). Default: 90 */
	quality?: number;
	/** Run structured interpretation after raw pixel diff */
	interpret?: boolean;
}

/** File path or encoded PNG, JPEG, or QOI bytes. */
export type BlazeDiffInput = string | Uint8Array;

export type BlazeDiffResult =
	| { match: true; interpretation?: InterpretResult }
	| { match: false; reason: "layout-diff" }
	| {
			match: false;
			reason: "pixel-diff";
			diffCount: number;
			diffPercentage: number;
			interpretation?: InterpretResult;
	  }
	| { match: false; reason: "file-not-exists"; file: string };

interface JsonOutput {
	diffCount: number;
	diffPercentage: number;
	identical: boolean;
	error?: string;
}

/** N-API binding result structure */
interface NapiDiffResult {
	matchResult: boolean;
	reason: string | null;
	diffCount: number | null;
	diffPercentage: number | null;
	interpretation: InterpretResult | null;
}

/** N-API binding options structure */
interface NapiDiffOptions {
	threshold?: number;
	antialiasing?: boolean;
	diffMask?: boolean;
	diffColorAlt?: [number, number, number];
	compression?: number;
	quality?: number;
	interpret?: boolean;
}

// ─── Interpret types ─────────────────────────────────────────────────────────

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

/** N-API binding interfaces for interpret */
interface NapiInterpretOptions {
	threshold?: number;
	antialiasing?: boolean;
}

/** Native binding interface */
interface NativeBinding {
	compare(
		basePath: string,
		comparePath: string,
		diffOutput: string | null,
		options: NapiDiffOptions | null,
	): NapiDiffResult;
	compareBuffers(
		base: Uint8Array,
		comparison: Uint8Array,
		diffOutput: string | null,
		options: NapiDiffOptions | null,
	): NapiDiffResult;
	interpretImages(
		image1Path: string,
		image2Path: string,
		options: NapiInterpretOptions | null,
	): InterpretResult;
}

function validateRgb(
	color: [number, number, number] | undefined,
): [number, number, number] | undefined {
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
	return color;
}

const PLATFORM_PACKAGES: Record<
	string,
	{ packageName: string; packageDir: string }
> = {
	"darwin-arm64": {
		packageName: "@blazediff/core-native-darwin-arm64",
		packageDir: "core-native-darwin-arm64",
	},
	"darwin-x64": {
		packageName: "@blazediff/core-native-darwin-x64",
		packageDir: "core-native-darwin-x64",
	},
	"linux-arm64": {
		packageName: "@blazediff/core-native-linux-arm64",
		packageDir: "core-native-linux-arm64",
	},
	"linux-x64": {
		packageName: "@blazediff/core-native-linux-x64",
		packageDir: "core-native-linux-x64",
	},
	"win32-arm64": {
		packageName: "@blazediff/core-native-win32-arm64",
		packageDir: "core-native-win32-arm64",
	},
	"win32-x64": {
		packageName: "@blazediff/core-native-win32-x64",
		packageDir: "core-native-win32-x64",
	},
};

// Cache for native binding
let nativeBinding: NativeBinding | null = null;
let nativeBindingAttempted = false;

/**
 * Try to load the native N-API binding for better performance.
 * Returns null if loading fails (fallback to execFile will be used).
 */
function tryLoadNativeBinding(): NativeBinding | null {
	if (nativeBindingAttempted) {
		return nativeBinding;
	}
	nativeBindingAttempted = true;

	const platform = os.platform();
	const arch = os.arch();
	const key = `${platform}-${arch}`;
	const platformInfo = PLATFORM_PACKAGES[key];

	if (!platformInfo) {
		return null;
	}

	try {
		const require = createRequire(import.meta.url);
		// Try to require the native .node file from the platform package
		const binding = require(platformInfo.packageName) as NativeBinding;
		if (typeof binding?.compare === "function") {
			nativeBinding = binding;
			return binding;
		}
	} catch {
		// Native binding not available, will use execFile fallback
	}

	// Also try sibling package fallback for monorepo development
	try {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const packagesDir = path.resolve(currentDir, "..", "..");
		const nodePath = path.join(
			packagesDir,
			platformInfo.packageDir,
			"blazediff.node",
		);
		if (existsSync(nodePath)) {
			const require = createRequire(import.meta.url);
			const binding = require(nodePath) as NativeBinding;
			if (typeof binding?.compare === "function") {
				nativeBinding = binding;
				return binding;
			}
		}
	} catch {
		// Fallback also failed
	}

	return null;
}

/**
 * Convert N-API result to BlazeDiffResult
 */
function convertNapiResult(result: NapiDiffResult): BlazeDiffResult {
	const interpretation = result.interpretation ?? undefined;

	if (result.matchResult) {
		return { match: true, interpretation };
	}

	if (result.reason === "layout-diff") {
		return { match: false, reason: "layout-diff" };
	}

	return {
		match: false,
		reason: "pixel-diff",
		diffCount: result.diffCount ?? 0,
		diffPercentage: result.diffPercentage ?? 0,
		interpretation,
	};
}

/**
 * Convert BlazeDiffOptions to NapiDiffOptions
 */
function convertToNapiOptions(options?: BlazeDiffOptions): NapiDiffOptions {
	return {
		threshold: options?.threshold,
		antialiasing: options?.antialiasing,
		diffMask: options?.diffMask,
		diffColorAlt: validateRgb(options?.diffColorAlt),
		compression: options?.compression,
		quality: options?.quality,
		interpret: options?.interpret,
	};
}

function resolveBinaryPath(): string {
	const platform = os.platform();
	const arch = os.arch();
	const key = `${platform}-${arch}`;
	const platformInfo = PLATFORM_PACKAGES[key];

	if (!platformInfo) {
		throw new Error(
			`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`,
		);
	}

	const binaryName = platform === "win32" ? "blazediff.exe" : "blazediff";

	// Try to resolve from installed optional dependency
	try {
		const require = createRequire(import.meta.url);
		const packagePath = require.resolve(
			`${platformInfo.packageName}/package.json`,
		);
		const packageDir = path.dirname(packagePath);
		const binaryPath = path.join(packageDir, binaryName);
		if (existsSync(binaryPath)) {
			return binaryPath;
		}
	} catch {
		// Optional dependency not installed, try sibling package fallback
	}

	// Fallback for monorepo development: look for sibling package
	const currentDir = path.dirname(fileURLToPath(import.meta.url));
	const packagesDir = path.resolve(currentDir, "..", "..");
	const siblingPath = path.join(
		packagesDir,
		platformInfo.packageDir,
		binaryName,
	);

	if (existsSync(siblingPath)) {
		return siblingPath;
	}

	throw new Error(
		`Platform package ${platformInfo.packageName} is not installed. ` +
			`This usually means the optional dependency wasn't installed for your platform. ` +
			`Try reinstalling with: npm install @blazediff/core-native`,
	);
}

let cachedBinaryPath: string | null = null;

function getBinaryPathInternal(): string {
	if (!cachedBinaryPath) {
		cachedBinaryPath = resolveBinaryPath();
	}
	return cachedBinaryPath;
}

function buildArgs(diffOutput?: string, options?: BlazeDiffOptions): string[] {
	const args: string[] = [];
	const useInterpret = options?.interpret ?? false;

	if (diffOutput) args.push(diffOutput);
	if (useInterpret) args.push("--interpret");
	args.push("--output-format=json");

	if (!options) return args;

	if (options.threshold !== undefined)
		args.push(`--threshold=${options.threshold}`);
	if (options.antialiasing) args.push("--antialiasing");
	if (options.diffMask) args.push("--diff-mask");
	const diffColorAlt = validateRgb(options.diffColorAlt);
	if (diffColorAlt) args.push(`--diff-color-alt=${diffColorAlt.join(",")}`);
	if (options.compression !== undefined)
		args.push(`--compression=${options.compression}`);
	if (options.quality !== undefined) args.push(`--quality=${options.quality}`);

	return args;
}

function parseJsonOutput(text: string): JsonOutput | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
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
	return basePath; // default to base if can't determine
}

/**
 * Compare using execFile (fallback when native binding is unavailable)
 */
async function execFileCompare(
	basePath: string,
	comparePath: string,
	diffOutput?: string,
	options?: BlazeDiffOptions,
): Promise<BlazeDiffResult> {
	const binaryPath = getBinaryPathInternal();
	const args = [basePath, comparePath, ...buildArgs(diffOutput, options)];

	if (options?.interpret) {
		return execFileInterpretCompare(binaryPath, args, basePath, comparePath);
	}

	try {
		await execFileAsync(binaryPath, args);
		return { match: true };
	} catch (err) {
		const { code, stdout, stderr } = err as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};
		const output = stdout || stderr || "";

		// Exit code 1: images differ (pixel diff or layout diff)
		if (code === 1) {
			const json = parseJsonOutput(output);
			if (json?.error?.includes("Layout differs")) {
				return { match: false, reason: "layout-diff" };
			}
			if (json) {
				return {
					match: false,
					reason: "pixel-diff",
					diffCount: json.diffCount,
					diffPercentage: json.diffPercentage,
				};
			}
			// Fallback for non-JSON output
			if (output.includes("Layout differs")) {
				return { match: false, reason: "layout-diff" };
			}
		}

		// Exit code 2: error (file not found, invalid format, etc.)
		if (code === 2) {
			const missingFile = detectMissingFile(output, basePath, comparePath);
			if (missingFile) {
				return { match: false, reason: "file-not-exists", file: missingFile };
			}
		}

		throw new Error(output || `blazediff exited with code ${code}`);
	}
}

async function execFileInterpretCompare(
	binaryPath: string,
	args: string[],
	basePath: string,
	comparePath: string,
): Promise<BlazeDiffResult> {
	try {
		const { stdout } = await execFileAsync(binaryPath, args);
		const interpretation = JSON.parse(stdout) as InterpretResult;
		return { match: true, interpretation };
	} catch (err) {
		const { code, stdout, stderr } = err as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};

		if (code === 1 && stdout) {
			const interpretation = JSON.parse(stdout) as InterpretResult;
			return {
				match: false,
				reason: "pixel-diff",
				diffCount: interpretation.diffCount,
				diffPercentage: interpretation.diffPercentage,
				interpretation,
			};
		}

		const errorOutput = stderr || stdout || "";

		if (code === 2) {
			const missingFile = detectMissingFile(errorOutput, basePath, comparePath);
			if (missingFile) {
				return { match: false, reason: "file-not-exists", file: missingFile };
			}
		}

		throw new Error(
			errorOutput || `blazediff --interpret exited with code ${code}`,
		);
	}
}

/**
 * Compare two encoded images (PNG, JPEG, or QOI) and optionally generate a diff image.
 *
 * Inputs must both be file paths or both be encoded byte arrays. Node.js Buffer
 * values are Uint8Array instances and can be passed directly.
 *
 * Uses native N-API bindings when available for ~10-100x better performance
 * on small images (no process spawn overhead). Path inputs fall back to
 * execFile if native bindings are unavailable.
 *
 * @example
 * ```ts
 * // With file paths and diff output
 * const result = await compare('expected.png', 'actual.png', 'diff.png');
 *
 * // With encoded image buffers
 * const result = await compare(expectedPngBuffer, actualPngBuffer);
 *
 * if (result.match) {
 *   console.log('Images identical');
 * } else if (result.reason === 'pixel-diff') {
 *   console.log(`${result.diffCount} pixels differ`);
 * }
 * ```
 */
export async function compare(
	base: BlazeDiffInput,
	comparison: BlazeDiffInput,
	diffOutput?: string,
	options?: BlazeDiffOptions,
): Promise<BlazeDiffResult> {
	const baseIsPath = typeof base === "string";
	const comparisonIsPath = typeof comparison === "string";
	if (baseIsPath !== comparisonIsPath) {
		throw new TypeError(
			"Image inputs must both be file paths or both be encoded byte arrays",
		);
	}

	const binding = tryLoadNativeBinding();
	if (binding) {
		try {
			const result =
				baseIsPath && comparisonIsPath
					? binding.compare(
							base,
							comparison,
							diffOutput ?? null,
							convertToNapiOptions(options),
						)
					: binding.compareBuffers(
							base as Uint8Array,
							comparison as Uint8Array,
							diffOutput ?? null,
							convertToNapiOptions(options),
						);
			return convertNapiResult(result);
		} catch (err) {
			if (baseIsPath && comparisonIsPath) {
				const message = err instanceof Error ? err.message : String(err);
				const missingFile = detectMissingFile(message, base, comparison);
				if (missingFile) {
					return {
						match: false,
						reason: "file-not-exists",
						file: missingFile,
					};
				}
			}
			throw err;
		}
	}

	if (!baseIsPath || !comparisonIsPath) {
		throw new Error("Encoded image inputs require the native N-API binding");
	}
	return execFileCompare(base, comparison, diffOutput, options);
}

/** Get the path to the blazediff binary for direct CLI usage. */
export function getBinaryPath(): string {
	return getBinaryPathInternal();
}

/**
 * Check if native N-API bindings are available.
 * Returns true if the native module loaded successfully.
 */
export function hasNativeBinding(): boolean {
	return tryLoadNativeBinding() !== null;
}

// ─── Interpret ───────────────────────────────────────────────────────────────

/**
 * Interpret the diff between two images, returning structured analysis results.
 *
 * Inputs must both be file paths or both be encoded byte arrays. Uses native
 * N-API bindings when available for better performance. Path inputs fall back
 * to execFile if native bindings are unavailable.
 *
 * @example
 * ```ts
 * const result = await interpret('expected.png', 'actual.png');
 * console.log(result.summary);
 * for (const region of result.regions) {
 *   console.log(`${region.position}: ${region.changeType} (${region.percentage.toFixed(2)}%)`);
 * }
 * ```
 */
export async function interpret(
	image1: BlazeDiffInput,
	image2: BlazeDiffInput,
	options?: Pick<BlazeDiffOptions, "threshold" | "antialiasing">,
): Promise<InterpretResult> {
	const image1IsPath = typeof image1 === "string";
	const image2IsPath = typeof image2 === "string";
	const binding = tryLoadNativeBinding();
	if (binding && image1IsPath && image2IsPath) {
		return binding.interpretImages(image1, image2, {
			threshold: options?.threshold,
			antialiasing: options?.antialiasing,
		});
	}

	const result = await compare(image1, image2, undefined, {
		...options,
		interpret: true,
	});

	if ("interpretation" in result && result.interpretation) {
		return result.interpretation;
	}

	throw new Error("Interpretation result missing from compare");
}
