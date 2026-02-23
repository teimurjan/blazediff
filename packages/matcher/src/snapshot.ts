import { existsSync, unlinkSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { type RunComparisonResult, runComparison } from "./comparators";
import { isSsimMethod } from "./comparators/ssim";
import {
	ensureDir,
	fileExists,
	isFilePath,
	isImageData,
	isRawPngBuffer,
	loadPNG,
	normalizeImageInput,
	savePNG,
	saveRawPNGBuffer,
} from "./image-io";
import { formatMessage } from "./reporter";
import type {
	ComparisonResult,
	ImageData,
	ImageInput,
	MatcherOptions,
	TestContext,
} from "./types";
import {
	compareInWorker,
	loadPNGInWorker,
	normalizeInWorker,
} from "./worker-pool";

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
 * Main snapshot comparison function
 */
export async function getOrCreateSnapshot(
	received: ImageInput,
	options: MatcherOptions,
	testContext: TestContext,
): Promise<ComparisonResult> {
	const paths = getSnapshotPaths(testContext, options);
	const { snapshotDir, baselinePath, receivedPath, diffPath } = paths;

	// Track if input is a raw PNG buffer for fast path on first run
	const isRawPng = isRawPngBuffer(received);
	const rawPngBuffer = isRawPng ? (received as Buffer | Uint8Array) : null;

	// Use worker by default for better performance
	const useWorker = options.runInWorker !== false;

	// Helper functions that use worker or main thread based on option
	const normalize = useWorker ? normalizeInWorker : normalizeImageInput;
	const loadImage = useWorker ? loadPNGInWorker : loadPNG;
	const compare = useWorker
		? (r: ImageData, b: ImageInput, diffPath?: string) =>
				compareInWorker(r, b, options.method, options, diffPath)
		: (r: ImageData, b: ImageInput, diffPath?: string) =>
				runComparison(r, b, options.method, options, diffPath);

	// Ensure snapshot directory exists
	ensureDir(snapshotDir);

	// Check if baseline exists
	const baselineExists = fileExists(baselinePath);

	// Determine update mode
	const updateMode =
		options.updateSnapshots === true
			? "all"
			: options.updateSnapshots === false ||
					options.updateSnapshots === undefined
				? "new"
				: options.updateSnapshots;

	// Create new snapshot if baseline doesn't exist and mode allows
	const shouldCreateNew =
		!baselineExists &&
		updateMode !== "none" &&
		(updateMode === "new" || updateMode === "all");

	if (shouldCreateNew) {
		// Fast path: if we have the raw PNG buffer, write it directly (no decode/encode)
		if (rawPngBuffer) {
			saveRawPNGBuffer(baselinePath, rawPngBuffer);
		} else if (isFilePath(received)) {
			const img = await loadImage(received);
			await savePNG(baselinePath, img.data, img.width, img.height);
		} else if (isImageData(received)) {
			await savePNG(
				baselinePath,
				received.data,
				received.width,
				received.height,
			);
		} else {
			const normalized = await normalize(received);
			await savePNG(
				baselinePath,
				normalized.data,
				normalized.width,
				normalized.height,
			);
		}

		const message = formatMessage({
			pass: true,
			method: options.method,
			snapshotCreated: true,
			baselinePath,
			receivedPath,
			diffPath,
			diffCount: 0,
			diffPercentage: 0,
			score: 0,
			threshold: options.failureThreshold ?? 0,
			thresholdType: options.failureThresholdType ?? "pixel",
			updateCommand: options.updateCommand,
		});

		return {
			pass: true,
			message,
			baselinePath,
			snapshotStatus: "added",
		};
	}

	// For bin method, skip normalization - it requires file paths
	// For other methods, normalize if needed
	let result: RunComparisonResult;
	let normalizedReceived: ImageInput;

	if (options.method === "bin") {
		// bin method requires file paths, call runComparison directly
		result = await runComparison(
			received,
			baselinePath,
			options.method,
			options,
			diffPath,
		);
		normalizedReceived = received; // Keep as file path for bin method
	} else {
		// Normalize received for comparison (deferred until needed)
		normalizedReceived = isRawPng ? await normalize(received) : received;

		// Run comparison (in worker or main thread based on option)
		result = await compare(
			isImageData(normalizedReceived)
				? normalizedReceived
				: await normalize(normalizedReceived),
			baselinePath,
			diffPath,
		);
	}

	// Check if it passes threshold
	const pass = checkThreshold(options.method, result, options);

	if (pass) {
		// Clean up received/diff files on success
		if (existsSync(receivedPath)) unlinkSync(receivedPath);
		if (existsSync(diffPath)) unlinkSync(diffPath);

		const message = formatMessage({
			pass,
			method: options.method,
			snapshotCreated: false,
			baselinePath,
			receivedPath,
			diffPath,
			diffCount: result.diffCount,
			diffPercentage: result.diffPercentage,
			score: result.score,
			threshold: options.failureThreshold ?? 0,
			thresholdType: options.failureThresholdType ?? "pixel",
			updateCommand: options.updateCommand,
		});

		return {
			pass: true,
			message,
			diffCount: result.diffCount,
			diffPercentage: result.diffPercentage,
			score: result.score,
			baselinePath,
			snapshotStatus: "matched",
		};
	}

	// If update mode is 'all' and images differ, update the baseline
	if (updateMode === "all") {
		// For raw PNG buffers in updateAll mode, use direct write
		if (rawPngBuffer) {
			saveRawPNGBuffer(baselinePath, rawPngBuffer);
		} else if (isFilePath(normalizedReceived)) {
			const img = await loadImage(normalizedReceived);
			await savePNG(baselinePath, img.data, img.width, img.height);
		} else if (isImageData(normalizedReceived)) {
			await savePNG(
				baselinePath,
				normalizedReceived.data,
				normalizedReceived.width,
				normalizedReceived.height,
			);
		}

		// Clean up any old received/diff files
		if (existsSync(receivedPath)) unlinkSync(receivedPath);
		if (existsSync(diffPath)) unlinkSync(diffPath);

		const message = formatMessage({
			pass: true,
			method: options.method,
			snapshotCreated: true,
			baselinePath,
			receivedPath,
			diffPath,
			diffCount: 0,
			diffPercentage: 0,
			score: 0,
			threshold: options.failureThreshold ?? 0,
			thresholdType: options.failureThresholdType ?? "pixel",
			updateCommand: options.updateCommand,
		});

		return {
			pass: true,
			message,
			baselinePath,
			snapshotStatus: "updated",
		};
	}

	// Save received image for debugging
	// For raw PNG buffers, use direct write
	if (rawPngBuffer) {
		saveRawPNGBuffer(receivedPath, rawPngBuffer);
	} else if (isFilePath(normalizedReceived)) {
		const img = await loadImage(normalizedReceived);
		await savePNG(receivedPath, img.data, img.width, img.height);
	} else if (isImageData(normalizedReceived)) {
		await savePNG(
			receivedPath,
			normalizedReceived.data,
			normalizedReceived.width,
			normalizedReceived.height,
		);
	}

	// Save diff output if available (not for bin method which doesn't produce diff)
	if (result.diffOutput && options.method !== "bin") {
		const dims = isImageData(normalizedReceived)
			? normalizedReceived
			: await normalize(normalizedReceived);
		await savePNG(diffPath, result.diffOutput, dims.width, dims.height);
	}

	const message = formatMessage({
		pass,
		method: options.method,
		snapshotCreated: false,
		baselinePath,
		receivedPath,
		diffPath,
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		score: result.score,
		threshold: options.failureThreshold ?? 0,
		thresholdType: options.failureThresholdType ?? "pixel",
		updateCommand: options.updateCommand,
	});

	return {
		pass: false,
		message,
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
