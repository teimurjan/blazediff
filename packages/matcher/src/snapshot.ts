import { existsSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { runComparison } from "./comparators";
import { isSsimMethod } from "./comparators/ssim";
import {
	ensureDir,
	fileExists,
	isFilePath,
	loadPNG,
	normalizeImageInput,
	savePNG,
} from "./image-io";
import { formatMessage as formatReport } from "./reporter";
import type {
	ComparisonResult,
	ImageData,
	ImageInput,
	MatcherOptions,
	TestContext,
} from "./types";

/**
 * Generate snapshot identifier from test context
 */
function generateSnapshotIdentifier(testContext: TestContext): string {
	// Sanitize test name for use in filename
	const sanitized = testContext.testName
		.replace(/[^a-zA-Z0-9-_\s]/g, "")
		.replace(/\s+/g, "-")
		.toLowerCase();

	return sanitized || "snapshot";
}

/**
 * Get snapshot paths for a test
 */
function getSnapshotPaths(
	testContext: TestContext,
	options: MatcherOptions,
): {
	snapshotDir: string;
	baselinePath: string;
	receivedPath: string;
	diffPath: string;
} {
	const testDir = dirname(testContext.testPath);
	const snapshotsDir = options.snapshotsDir ?? "__snapshots__";

	// If snapshotsDir is absolute, use it directly; otherwise join with testDir
	const snapshotDir = isAbsolute(snapshotsDir)
		? snapshotsDir
		: join(testDir, snapshotsDir);

	const identifier =
		options.snapshotIdentifier ?? generateSnapshotIdentifier(testContext);

	return {
		snapshotDir,
		baselinePath: join(snapshotDir, `${identifier}.png`),
		receivedPath: join(snapshotDir, `${identifier}.received.png`),
		diffPath: join(snapshotDir, `${identifier}.diff.png`),
	};
}

/**
 * Check if comparison passes based on threshold
 */
function checkThreshold(
	method: MatcherOptions["method"],
	result: {
		diffCount?: number;
		diffPercentage?: number;
		score?: number;
	},
	options: MatcherOptions,
): boolean {
	const threshold = options.failureThreshold ?? 0;
	const thresholdType = options.failureThresholdType ?? "pixel";

	// For SSIM variants: score of 1 = identical, lower = different
	if (isSsimMethod(method)) {
		const similarity = result.score ?? 0;
		if (thresholdType === "percent") {
			// Convert to percentage difference: 1 - score
			const diffPercent = (1 - similarity) * 100;
			return diffPercent <= threshold;
		}
		// For pixel threshold with SSIM, we can't directly compare
		// Use a simple check: pass if score is above (1 - threshold/100)
		return similarity >= 1 - threshold / 100;
	}

	// For GMSD: score of 0 = identical, higher = different
	if (method === "gmsd") {
		const gmsdScore = result.score ?? 0;
		if (thresholdType === "percent") {
			// GMSD typically ranges 0-0.35, scale to percentage
			const diffPercent = gmsdScore * 100;
			return diffPercent <= threshold;
		}
		// For pixel threshold, use score directly
		return gmsdScore <= threshold / 100;
	}

	// For pixel-based methods (bin, core)
	if (thresholdType === "percent") {
		return (result.diffPercentage ?? 0) <= threshold;
	}
	return (result.diffCount ?? 0) <= threshold;
}

/**
 * Format result message
 */
function formatMessage(
	pass: boolean,
	method: MatcherOptions["method"],
	result: {
		diffCount?: number;
		diffPercentage?: number;
		score?: number;
	},
	options: MatcherOptions,
	paths: {
		baselinePath: string;
		receivedPath: string;
		diffPath: string;
	},
	isNewSnapshot: boolean,
): string {
	return formatReport({
		pass,
		method,
		isNewSnapshot,
		paths,
		result,
		threshold: options.failureThreshold ?? 0,
		thresholdType: options.failureThresholdType ?? "pixel",
		isSsim: isSsimMethod(method),
		isGmsd: method === "gmsd",
	});
}

/**
 * Main snapshot comparison function
 */
export async function getOrCreateSnapshot(
	received: ImageInput,
	options: MatcherOptions,
	testContext: TestContext,
): Promise<ComparisonResult> {
	const paths = getSnapshotPaths(testContext, options);
	const { snapshotDir, baselinePath, receivedPath, diffPath } = paths;

	// Ensure snapshot directory exists
	ensureDir(snapshotDir);

	// Check if baseline exists
	const baselineExists = fileExists(baselinePath);

	// If update mode or no baseline, create/update the snapshot
	if (options.updateSnapshots || !baselineExists) {
		// Save received as new baseline
		if (isFilePath(received)) {
			// Copy file to snapshot location
			const img = await loadPNG(received);
			await savePNG(baselinePath, img.data, img.width, img.height);
		} else {
			await savePNG(baselinePath, received.data, received.width, received.height);
		}

		// Clean up any old received/diff files
		if (existsSync(receivedPath)) unlinkSync(receivedPath);
		if (existsSync(diffPath)) unlinkSync(diffPath);

		return {
			pass: true,
			message: formatMessage(true, options.method, {}, options, paths, true),
			baselinePath,
			snapshotStatus: !baselineExists ? "added" : "updated",
		};
	}

	// Run comparison
	const result = await runComparison(
		received,
		baselinePath,
		options.method,
		options,
		diffPath,
	);

	// Check if it passes threshold
	const pass = checkThreshold(options.method, result, options);

	if (pass) {
		// Clean up received/diff files on success
		if (existsSync(receivedPath)) unlinkSync(receivedPath);
		if (existsSync(diffPath)) unlinkSync(diffPath);

		return {
			pass: true,
			message: formatMessage(
				pass,
				options.method,
				result,
				options,
				paths,
				false,
			),
			diffCount: result.diffCount,
			diffPercentage: result.diffPercentage,
			score: result.score,
			baselinePath,
			snapshotStatus: "matched",
		};
	}

	// Save received image for debugging
	if (isFilePath(received)) {
		const img = await loadPNG(received);
		await savePNG(receivedPath, img.data, img.width, img.height);
	} else {
		await savePNG(receivedPath, received.data, received.width, received.height);
	}

	// Save diff output if available
	if (result.diffOutput) {
		const receivedData = await normalizeImageInput(received);
		await savePNG(
			diffPath,
			result.diffOutput,
			receivedData.width,
			receivedData.height,
		);
	}

	return {
		pass: false,
		message: formatMessage(pass, options.method, result, options, paths, false),
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		score: result.score,
		baselinePath,
		receivedPath,
		diffPath,
		snapshotStatus: "failed",
	};
}

/**
 * Compare two images directly without snapshot management
 */
export async function compareImages(
	received: ImageInput,
	baseline: ImageInput,
	options: MatcherOptions,
): Promise<ComparisonResult> {
	const result = await runComparison(
		received,
		baseline,
		options.method,
		options,
	);

	const pass = checkThreshold(options.method, result, options);

	return {
		pass,
		message: pass
			? "Images match."
			: `Images differ: ${result.diffCount ?? result.score} ${
					result.diffCount !== undefined ? "pixels" : "score"
				}`,
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		score: result.score,
	};
}
