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
	/** PNG compression level (0-9, 0=fastest/largest, 9=slowest/smallest) */
	compression?: number;
	/** JPEG quality (1-100). Default: 90 */
	quality?: number;
	/** Run structured interpretation after raw pixel diff */
	interpret?: boolean;
	/** Output format for diff: "png" (default) or "html" (interpret report) */
	outputFormat?: "png" | "html";
}

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
	compression?: number;
	quality?: number;
	interpret?: boolean;
	outputFormat?: string;
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
	interpretImages(
		image1Path: string,
		image2Path: string,
		options: NapiInterpretOptions | null,
	): InterpretResult;
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
		compression: options?.compression,
		quality: options?.quality,
		interpret: options?.interpret,
		outputFormat: options?.outputFormat,
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
	const useInterpret = options?.interpret || options?.outputFormat === "html";

	if (diffOutput) args.push(diffOutput);
	if (useInterpret) args.push("--interpret");
	args.push("--output-format=json");

	if (!options) return args;

	if (options.threshold !== undefined)
		args.push(`--threshold=${options.threshold}`);
	if (options.antialiasing) args.push("--antialiasing");
	if (!useInterpret) {
		if (options.diffMask) args.push("--diff-mask");
		if (options.compression !== undefined)
			args.push(`--compression=${options.compression}`);
		if (options.quality !== undefined)
			args.push(`--quality=${options.quality}`);
	}

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

	if (options?.interpret || options?.outputFormat === "html") {
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
 * Compare two images (PNG or JPEG) and optionally generate a diff image.
 *
 * Uses native N-API bindings when available for ~10-100x better performance
 * on small images (no process spawn overhead). Falls back to execFile if
 * native bindings are unavailable.
 *
 * @example
 * ```ts
 * // With diff output
 * const result = await compare('expected.png', 'actual.png', 'diff.png');
 *
 * // Without diff output (faster, just returns comparison result)
 * const result = await compare('expected.png', 'actual.png');
 *
 * if (result.match) {
 *   console.log('Images identical');
 * } else if (result.reason === 'pixel-diff') {
 *   console.log(`${result.diffCount} pixels differ`);
 * }
 * ```
 */
export async function compare(
	basePath: string,
	comparePath: string,
	diffOutput?: string,
	options?: BlazeDiffOptions,
): Promise<BlazeDiffResult> {
	// Try native binding first for better performance
	const binding = tryLoadNativeBinding();
	if (binding) {
		try {
			const result = binding.compare(
				basePath,
				comparePath,
				diffOutput ?? null,
				convertToNapiOptions(options),
			);
			return convertNapiResult(result);
		} catch (err) {
			// Check if it's a file-not-exists error
			const message = err instanceof Error ? err.message : String(err);
			const missingFile = detectMissingFile(message, basePath, comparePath);
			if (missingFile) {
				return { match: false, reason: "file-not-exists", file: missingFile };
			}
			// Re-throw other errors
			throw err;
		}
	}

	// Fallback to execFile
	return execFileCompare(basePath, comparePath, diffOutput, options);
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
 * Uses native N-API bindings when available for better performance.
 * Falls back to execFile if native bindings are unavailable.
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
	image1Path: string,
	image2Path: string,
	options?: Pick<BlazeDiffOptions, "threshold" | "antialiasing">,
): Promise<InterpretResult> {
	const binding = tryLoadNativeBinding();
	if (binding) {
		return binding.interpretImages(image1Path, image2Path, {
			threshold: options?.threshold,
			antialiasing: options?.antialiasing,
		});
	}

	const result = await compare(image1Path, image2Path, undefined, {
		...options,
		interpret: true,
	});

	if ("interpretation" in result && result.interpretation) {
		return result.interpretation;
	}

	throw new Error("Interpretation result missing from compare");
}
