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
	/** Fail immediately if images have different dimensions */
	failOnLayoutDiff?: boolean;
	/** PNG compression level (0-9, 0=fastest/largest, 9=slowest/smallest) */
	compression?: number;
}

export type BlazeDiffResult =
	| { match: true }
	| { match: false; reason: "layout-diff" }
	| { match: false; reason: "pixel-diff"; diffCount: number; diffPercentage: number }
	| { match: false; reason: "file-not-exists"; file: string };

interface JsonOutput {
	diffCount: number;
	diffPercentage: number;
	identical: boolean;
	error?: string;
}

const PLATFORM_PACKAGES: Record<string, { packageName: string; packageDir: string }> = {
	"darwin-arm64": { packageName: "@blazediff/bin-darwin-arm64", packageDir: "bin-darwin-arm64" },
	"darwin-x64": { packageName: "@blazediff/bin-darwin-x64", packageDir: "bin-darwin-x64" },
	"linux-arm64": { packageName: "@blazediff/bin-linux-arm64", packageDir: "bin-linux-arm64" },
	"linux-x64": { packageName: "@blazediff/bin-linux-x64", packageDir: "bin-linux-x64" },
	"win32-arm64": { packageName: "@blazediff/bin-win32-arm64", packageDir: "bin-win32-arm64" },
	"win32-x64": { packageName: "@blazediff/bin-win32-x64", packageDir: "bin-win32-x64" },
};

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
		const packagePath = require.resolve(`${platformInfo.packageName}/package.json`);
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
	const siblingPath = path.join(packagesDir, platformInfo.packageDir, binaryName);

	if (existsSync(siblingPath)) {
		return siblingPath;
	}

	throw new Error(
		`Platform package ${platformInfo.packageName} is not installed. ` +
			`This usually means the optional dependency wasn't installed for your platform. ` +
			`Try reinstalling with: npm install @blazediff/bin`,
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
	if (diffOutput) args.push(diffOutput);
	args.push("--output-format=json");

	if (!options) return args;

	if (options.threshold !== undefined) args.push(`--threshold=${options.threshold}`);
	if (options.antialiasing) args.push("--antialiasing");
	if (options.diffMask) args.push("--diff-mask");
	if (options.failOnLayoutDiff) args.push("--fail-on-layout");
	if (options.compression !== undefined) args.push(`--compression=${options.compression}`);

	return args;
}

function parseJsonOutput(text: string): JsonOutput | null {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function detectMissingFile(error: string, basePath: string, comparePath: string): string | null {
	if (!/Failed to load images:.*(?:No such file|not found)/i.test(error)) {
		return null;
	}
	if (error.includes(basePath)) return basePath;
	if (error.includes(comparePath)) return comparePath;
	return basePath; // default to base if can't determine
}

/**
 * Compare two PNG images and optionally generate a diff image.
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
	const binaryPath = getBinaryPathInternal();
	const args = [basePath, comparePath, ...buildArgs(diffOutput, options)];

	try {
		await execFileAsync(binaryPath, args);
		return { match: true };
	} catch (err) {
		const { code, stdout, stderr } = err as { code?: number; stdout?: string; stderr?: string };
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

/** Get the path to the blazediff binary for direct CLI usage. */
export function getBinaryPath(): string {
	return getBinaryPathInternal();
}
