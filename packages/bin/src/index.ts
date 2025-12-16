import { execFile } from "node:child_process";
import path from "node:path";
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

const BINARY_PATH = path.join(__dirname, "..", "bin", "blazediff.exe");

function buildArgs(diffOutput: string, options?: BlazeDiffOptions): string[] {
	const args = [diffOutput, "--output-format=json"];
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
 * Compare two PNG images and generate a diff image.
 *
 * @example
 * ```ts
 * const result = await compare('expected.png', 'actual.png', 'diff.png');
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
	diffOutput: string,
	options?: BlazeDiffOptions,
): Promise<BlazeDiffResult> {
	const args = [basePath, comparePath, ...buildArgs(diffOutput, options)];

	try {
		await execFileAsync(BINARY_PATH, args);
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
	return BINARY_PATH;
}
