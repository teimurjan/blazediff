import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface InterpretOptions {
	/** Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1 */
	threshold?: number;
	/** Enable anti-aliasing detection to exclude AA pixels from diff count */
	antialiasing?: boolean;
	/** Return compact results (summary + severity + compact regions only) */
	compact?: boolean;
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
}

export interface GradientStats {
	edgeScore: number;
}

export interface ClassificationSignals {
	blendsWithBgInImg1: boolean;
	blendsWithBgInImg2: boolean;
	lowColorDelta: boolean;
	lowEdgeChange: boolean;
	denseFill: boolean;
	sparseFill: boolean;
	tinyRegion: boolean;
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

export interface CompactRegion {
	position: string;
	changeType: string;
	confidence: number;
	percentage: number;
}

export interface InterpretResult {
	summary: string;
	totalRegions: number;
	regions: ChangeRegion[];
	severity: string;
	diffPercentage: number;
	width: number;
	height: number;
}

export interface CompactResult {
	summary: string;
	severity: string;
	diffPercentage: number;
	regions: CompactRegion[];
}

/** N-API binding interfaces */
interface NapiInterpretOptions {
	threshold?: number;
	antialiasing?: boolean;
}

interface NativeBinding {
	interpretImages(
		image1Path: string,
		image2Path: string,
		options: NapiInterpretOptions | null,
	): InterpretResult;
	interpretImagesCompact(
		image1Path: string,
		image2Path: string,
		options: NapiInterpretOptions | null,
	): CompactResult;
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

	const platform = os.platform();
	const arch = os.arch();
	const key = `${platform}-${arch}`;
	const platformInfo = PLATFORM_PACKAGES[key];

	if (!platformInfo) {
		return null;
	}

	try {
		const require = createRequire(import.meta.url);
		const binding = require(platformInfo.packageName) as NativeBinding;
		if (typeof binding?.interpretImages === "function") {
			nativeBinding = binding;
			return binding;
		}
	} catch {
		// Native binding not available, will use execFile fallback
	}

	// Sibling package fallback for monorepo development
	try {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const packagesDir = path.resolve(currentDir, "..", "..");
		const nodePath = path.join(
			packagesDir,
			platformInfo.packageDir,
			"blazediff-interpret.node",
		);
		if (existsSync(nodePath)) {
			const require = createRequire(import.meta.url);
			const binding = require(nodePath) as NativeBinding;
			if (typeof binding?.interpretImages === "function") {
				nativeBinding = binding;
				return binding;
			}
		}
	} catch {
		// Fallback also failed
	}

	return null;
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

	const binaryName =
		platform === "win32" ? "blazediff-interpret.exe" : "blazediff-interpret";

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

	// Fallback for monorepo development
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
			`Try reinstalling with: npm install @blazediff/interpret-native`,
	);
}

let cachedBinaryPath: string | null = null;

function getBinaryPathInternal(): string {
	if (!cachedBinaryPath) {
		cachedBinaryPath = resolveBinaryPath();
	}
	return cachedBinaryPath;
}

function buildArgs(options?: InterpretOptions): string[] {
	const args: string[] = ["--output-format=json"];

	if (!options) return args;

	if (options.threshold !== undefined)
		args.push(`--threshold=${options.threshold}`);
	if (options.antialiasing) args.push("--antialiasing");
	if (options.compact) args.push("--compact");

	return args;
}

async function execFileInterpret(
	image1Path: string,
	image2Path: string,
	options?: InterpretOptions,
): Promise<InterpretResult | CompactResult> {
	const binaryPath = getBinaryPathInternal();
	const args = [image1Path, image2Path, ...buildArgs(options)];

	try {
		const { stdout } = await execFileAsync(binaryPath, args);
		// Exit code 0: images identical
		return JSON.parse(stdout);
	} catch (err) {
		const { code, stdout, stderr } = err as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};

		// Exit code 1: images differ (JSON on stdout)
		if (code === 1 && stdout) {
			return JSON.parse(stdout);
		}

		// Exit code 2: error
		const errorOutput = stderr || stdout || "";
		throw new Error(
			errorOutput || `blazediff-interpret exited with code ${code}`,
		);
	}
}

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
 *
 * // Compact mode
 * const compact = await interpret('expected.png', 'actual.png', { compact: true });
 * ```
 */
export async function interpret(
	image1Path: string,
	image2Path: string,
	options?: InterpretOptions,
): Promise<InterpretResult | CompactResult> {
	const binding = tryLoadNativeBinding();
	if (binding) {
		const napiOptions: NapiInterpretOptions = {
			threshold: options?.threshold,
			antialiasing: options?.antialiasing,
		};

		if (options?.compact) {
			return binding.interpretImagesCompact(
				image1Path,
				image2Path,
				napiOptions,
			);
		}
		return binding.interpretImages(image1Path, image2Path, napiOptions);
	}

	return execFileInterpret(image1Path, image2Path, options);
}

/** Get the path to the blazediff-interpret binary for direct CLI usage. */
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
