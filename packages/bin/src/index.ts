import { execFile } from "node:child_process";
import path from "node:path";

export interface BlazeDiffOptions {
	/** Color difference threshold (0.0-1.0). Lower = more strict. Default: 0.1 */
	threshold?: number;
	/** Enable anti-aliasing detection to exclude AA pixels from diff count */
	antialiasing?: boolean;
	/** Output only differences with transparent background */
	diffMask?: boolean;
	/** Fail immediately if images have different dimensions */
	failOnLayoutDiff?: boolean;
}

export type BlazeDiffResult =
	| { match: true }
	| { match: false; reason: "layout-diff" }
	| {
			match: false;
			reason: "pixel-diff";
			/** Number of different pixels */
			diffCount: number;
			/** Percentage of different pixels (0-100) */
			diffPercentage: number;
	  }
	| {
			match: false;
			reason: "file-not-exists";
			/** Path to the file that doesn't exist */
			file: string;
	  };

interface JsonOutput {
	diffCount: number;
	diffPercentage: number;
	identical: boolean;
	error?: string;
}

function optionsToArgs(options?: BlazeDiffOptions): string[] {
	const args: string[] = ["--output-format=json"];

	if (!options) {
		return args;
	}

	if (options.threshold !== undefined) {
		args.push(`--threshold=${options.threshold}`);
	}

	if (options.antialiasing) {
		args.push("--antialiasing");
	}

	if (options.diffMask) {
		args.push("--diff-mask");
	}

	if (options.failOnLayoutDiff) {
		args.push("--fail-on-layout");
	}

	return args;
}

const NO_FILE_ERROR_REGEX =
	/Failed to load images:.*(?:No such file|not found)/i;

/**
 * Compare two images and generate a diff image
 *
 * @param basePath - Path to the base/expected image
 * @param comparePath - Path to the comparison/actual image
 * @param diffOutput - Path where the diff image will be saved
 * @param options - Comparison options
 * @returns Promise resolving to the comparison result
 *
 * @example
 * ```ts
 * import { compare } from '@blazediff/native';
 *
 * const result = await compare('expected.png', 'actual.png', 'diff.png');
 * if (result.match) {
 *   console.log('Images are identical!');
 * } else if (result.reason === 'pixel-diff') {
 *   console.log(`${result.diffCount} pixels differ (${result.diffPercentage}%)`);
 * }
 * ```
 */
export function compare(
	basePath: string,
	comparePath: string,
	diffOutput: string,
	options?: BlazeDiffOptions,
): Promise<BlazeDiffResult> {
	return new Promise((resolve, reject) => {
		let stdout = "";
		let stderr = "";

		const binaryPath = path.join(__dirname, "..", "bin", "blazediff.exe");

		const child = execFile(
			binaryPath,
			[basePath, comparePath, diffOutput, ...optionsToArgs(options)],
			(error, out, err) => {
				stdout = out;
				stderr = err;
			},
		);

		child.on("close", (code) => {
			switch (code) {
				case 0:
					resolve({ match: true });
					break;

				case 1: {
					// Could be layout diff or pixel diff - parse JSON output
					try {
						const output: JsonOutput = JSON.parse(stdout || stderr);
						if (output.error?.includes("Layout differs")) {
							resolve({ match: false, reason: "layout-diff" });
						} else {
							resolve({
								match: false,
								reason: "pixel-diff",
								diffCount: output.diffCount,
								diffPercentage: output.diffPercentage,
							});
						}
					} catch {
						// Fallback: check for layout diff in raw output
						if (
							stderr.includes("Layout differs") ||
							stdout.includes("Layout differs")
						) {
							resolve({ match: false, reason: "layout-diff" });
						} else {
							reject(new Error(stderr || stdout || `Exit code ${code}`));
						}
					}
					break;
				}

				case 2: {
					// Error case
					const errorMessage = stderr || stdout;
					const noFileMatch = errorMessage.match(NO_FILE_ERROR_REGEX);

					if (noFileMatch) {
						// Try to extract which file is missing
						const filePath = errorMessage.includes(basePath)
							? basePath
							: errorMessage.includes(comparePath)
								? comparePath
								: basePath;
						resolve({
							match: false,
							reason: "file-not-exists",
							file: filePath,
						});
					} else {
						reject(new Error(errorMessage || `Exit code ${code}`));
					}
					break;
				}

				default:
					reject(
						new Error(stderr || stdout || `Unexpected exit code: ${code}`),
					);
			}
		});
	});
}

/**
 * Get the path to the blazediff binary
 * Useful for direct CLI usage or spawning custom processes
 */
export function getBinaryPath(): string {
	return path.join(__dirname, "..", "bin", "blazediff.exe");
}
