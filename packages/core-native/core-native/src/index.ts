import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
	assertImage,
	assertOptions,
	BlazeDiffError,
	type BlazeDiffErrorCode,
	type DiffOptions,
	type DiffResult,
	type Image,
	type Rgb,
} from "@blazediff/core";

const execFileAsync = promisify(execFile);

export type { DiffOptions, DiffResult, Image } from "@blazediff/core";
export { BlazeDiffError } from "@blazediff/core";

/** A file path, encoded PNG, JPEG or QOI bytes, or raw RGBA pixels. */
export type NativeInput = Image | string | Uint8Array;

/** Raw pixels drawn in place, a file path, or a file path with encoder settings. */
export type NativeOutput =
	| Image
	| string
	| {
			path: string;
			/** PNG compression level (0-9, 0=fastest/largest). Default: 0 */
			compression?: number;
			/** JPEG quality (1-100). Default: 90 */
			quality?: number;
	  };

export type NativeDiffOptions = Omit<DiffOptions, "output"> & {
	/** Draw the diff here. A file is only written when the images differ. */
	output?: NativeOutput;
};

export type NativeDiffResult =
	| DiffResult
	| { kind: "io-error"; path?: string; message: string };

interface NapiImage {
	data: Uint8Array;
	width: number;
	height: number;
}

interface NapiInput {
	path?: string;
	encoded?: Uint8Array;
	image?: NapiImage;
}

interface NapiOutput {
	path?: string;
	compression?: number;
	quality?: number;
	image?: Uint8Array;
}

interface NapiDiffOptions {
	threshold?: number;
	antialiasing?: boolean;
	metric?: string;
	mask?: Uint8Array;
	window?: number;
	render?: {
		alpha?: number;
		diffColor?: Rgb;
		diffColorAlt?: Rgb;
		aaColor?: Rgb;
		background?: string;
	};
}

interface NapiDiffResult {
	kind: "compared" | "dimension-mismatch" | "io-error";
	count?: number;
	percentage?: number;
	identical?: boolean;
	window?: { x: number; y: number; count: number };
	a?: { width: number; height: number };
	b?: { width: number; height: number };
	path?: string;
	message?: string;
}

/** Native binding interface */
interface NativeBinding {
	diff(
		a: NapiInput,
		b: NapiInput,
		output: NapiOutput | null,
		options: NapiDiffOptions | null,
	): NapiDiffResult;
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
		if (typeof binding?.diff === "function") {
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
			if (typeof binding?.diff === "function") {
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

function isBytes(value: unknown): value is Uint8Array | Uint8ClampedArray {
	return (
		ArrayBuffer.isView(value) && (value as Uint8Array).BYTES_PER_ELEMENT === 1
	);
}

/** A Uint8Array view of the same memory, so the binding writes back into it. */
function asBytes(data: Uint8Array | Uint8ClampedArray): Uint8Array {
	return data instanceof Uint8Array
		? data
		: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

/** Validates in TS what can be checked without decoding. */
function toNapiOptions(options: NativeDiffOptions): NapiDiffOptions {
	assertOptions(options);
	const { threshold, antialiasing, metric, mask, window, render } = options;
	return {
		threshold,
		antialiasing,
		metric,
		mask: mask && asBytes(mask),
		// Floored to >= 1 like @blazediff/core; the binding clamps to the image size.
		window:
			window === undefined || !Number.isFinite(window)
				? undefined
				: Math.max(1, Math.floor(window)),
		render,
	};
}

function toNapiInput(input: NativeInput, name: string): NapiInput {
	if (typeof input === "string") return { path: input };
	if (isBytes(input)) return { encoded: asBytes(input) };
	assertImage(input, name, "invalid-image");
	return {
		image: {
			data: asBytes(input.data),
			width: input.width,
			height: input.height,
		},
	};
}

function toNapiOutput(output: NativeOutput | undefined): NapiOutput | null {
	if (output === undefined) return null;
	if (typeof output === "string") return { path: output };
	if ("path" in output) return output;
	assertImage(output, "output", "invalid-output");
	return { image: asBytes(output.data) };
}

/** Maps the binding's InvalidArg errors onto BlazeDiffError codes. */
function errorCode(message: string): BlazeDiffErrorCode {
	if (/mask/i.test(message)) return "invalid-mask";
	if (/^output/.test(message)) return "invalid-output";
	if (/^[ab][.:]|data size/i.test(message)) return "invalid-image";
	return "invalid-option";
}

function fromNapiResult(result: NapiDiffResult): NativeDiffResult {
	switch (result.kind) {
		case "dimension-mismatch":
			return {
				kind: "dimension-mismatch",
				a: result.a as { width: number; height: number },
				b: result.b as { width: number; height: number },
			};
		case "io-error":
			return {
				kind: "io-error",
				...(result.path !== undefined &&
					result.path !== null && { path: result.path }),
				message: result.message ?? "",
			};
		default:
			return {
				kind: "compared",
				count: result.count ?? 0,
				percentage: result.percentage ?? 0,
				identical: result.identical ?? false,
				...(result.window && { window: result.window }),
			};
	}
}

function buildArgs(
	output: string | undefined,
	options: NapiDiffOptions,
): string[] {
	const args: string[] = [];
	if (output) args.push("--output", output);
	args.push("--json");
	const { threshold, antialiasing, metric, window, render } = options;
	if (threshold !== undefined) args.push("--threshold", String(threshold));
	if (antialiasing === false) args.push("--no-antialiasing");
	if (metric) args.push("--metric", metric);
	if (window !== undefined) args.push("--window", String(window));
	if (render?.alpha !== undefined) args.push("--alpha", String(render.alpha));
	if (render?.diffColor) args.push("--diff-color", render.diffColor.join(","));
	if (render?.diffColorAlt)
		args.push("--diff-color-alt", render.diffColorAlt.join(","));
	if (render?.aaColor) args.push("--aa-color", render.aaColor.join(","));
	if (render?.background) args.push("--background", render.background);
	return args;
}

function parseJson(text: string | undefined): Record<string, unknown> | null {
	try {
		return JSON.parse(text ?? "");
	} catch {
		return null;
	}
}

/** Runs the `blazediff` CLI when the N-API binding is unavailable. Paths only. */
async function execFileDiff(
	a: string,
	b: string,
	output: NapiOutput | null,
	options: NapiDiffOptions,
): Promise<NativeDiffResult> {
	const args = [a, b, ...buildArgs(output?.path, options)];
	if (output?.compression !== undefined)
		args.push("--compression", String(output.compression));
	if (output?.quality !== undefined)
		args.push("--quality", String(output.quality));

	let stdout: string | undefined;
	try {
		({ stdout } = await execFileAsync(getBinaryPathInternal(), args));
	} catch (err) {
		const failure = err as { code?: number; stdout?: string; stderr?: string };
		// Exit code 1: the images differ or their dimensions do not.
		if (failure.code !== 1) {
			const json = parseJson(failure.stderr);
			if (json?.kind === "io-error") return fromNapiResult(json as never);
			throw new Error(
				(json?.message as string | undefined) ??
					(failure.stderr || `blazediff exited with code ${failure.code}`),
			);
		}
		stdout = failure.stdout;
	}
	const json = parseJson(stdout);
	if (!json) throw new Error(`blazediff printed invalid JSON: ${stdout}`);
	return fromNapiResult(json as never);
}

/**
 * Compares two images with the native Rust engine.
 *
 * Inputs may be file paths, encoded PNG, JPEG or QOI bytes (a Node.js Buffer
 * works), or raw RGBA `Image`s, mixed freely. Uses the N-API binding when it
 * loads; otherwise falls back to the `blazediff` CLI, which supports path
 * inputs, a path output and no mask.
 *
 * Unreadable inputs return `kind: "io-error"`; invalid options throw a
 * {@link BlazeDiffError}.
 *
 * @example
 * ```ts
 * const result = await diff("expected.png", "actual.png", { output: "diff.png" });
 * if (result.kind === "compared" && !result.identical) {
 *   console.log(`${result.count} pixels differ`);
 * }
 * ```
 */
export async function diff(
	a: NativeInput,
	b: NativeInput,
	options: NativeDiffOptions = {},
): Promise<NativeDiffResult> {
	const napiOptions = toNapiOptions(options);
	const napiA = toNapiInput(a, "a");
	const napiB = toNapiInput(b, "b");
	const napiOutput = toNapiOutput(options.output);

	const binding = tryLoadNativeBinding();
	if (binding) {
		try {
			return fromNapiResult(
				binding.diff(napiA, napiB, napiOutput, napiOptions),
			);
		} catch (err) {
			const { code, message } = err as { code?: string; message?: string };
			if (code === "InvalidArg" && message)
				throw new BlazeDiffError(errorCode(message), message);
			throw err;
		}
	}

	if (napiA.path === undefined || napiB.path === undefined)
		throw new Error(
			"Encoded and raw image inputs require the native N-API binding",
		);
	if (napiOutput?.image)
		throw new Error("An Image output requires the native N-API binding");
	if (napiOptions.mask)
		throw new Error("mask requires the native N-API binding");
	return execFileDiff(napiA.path, napiB.path, napiOutput, napiOptions);
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
