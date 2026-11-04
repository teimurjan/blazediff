import type { Buffer } from "node:buffer";
import type { DiffOptions } from "@blazediff/core";
import type { GmsdOptions } from "@blazediff/gmsd";
import type { SsimOptions } from "@blazediff/ssim";
/**
 * Comparison methods available in blazediff
 */
export type ComparisonMethod =
	| "core-native" // @blazediff/core-native (Rust N-API)
	| "core" // @blazediff/core (pixel-by-pixel YIQ)
	| "core-wasm" // @blazediff/core-wasm (WebAssembly, same algo as core-native)
	| "ssim" // @blazediff/ssim (standard SSIM)
	| "msssim" // @blazediff/ssim/msssim (multi-scale SSIM)
	| "hitchhikers-ssim" // @blazediff/ssim/hitchhikers-ssim (fast SSIM)
	| "gmsd"; // @blazediff/gmsd (gradient magnitude)

/**
 * Status of a snapshot operation
 */
export type SnapshotStatus = "added" | "matched" | "updated" | "failed";

/**
 * Image input - file path, raw PNG buffer, or buffer with dimensions
 */
export type ImageInput =
	| string
	| Buffer
	| Uint8Array
	| {
			data: Uint8Array | Uint8ClampedArray | Buffer;
			width: number;
			height: number;
	  };

/**
 * Options for the matcher
 */
export interface MatcherOptions {
	/** Comparison method to use */
	method: ComparisonMethod;

	/**
	 * Failure threshold - number of pixels or percentage difference allowed
	 * @default 0
	 */
	failureThreshold?: number;

	/**
	 * How to interpret failureThreshold
	 * @default 'pixel'
	 */
	failureThresholdType?: "pixel" | "percent";

	/**
	 * Directory to store snapshots relative to test file
	 * @default '__snapshots__'
	 */
	snapshotsDir?: string;

	/**
	 * Custom identifier for the snapshot file
	 * If not provided, derived from test name
	 */
	snapshotIdentifier?: string;

	/**
	 * Snapshot update mode (following Vitest's logic)
	 * - 'all': update all snapshots (vitest -u)
	 * - 'new': create new snapshots only, don't update existing (default)
	 * - 'none': don't create or update any snapshots
	 * - true: same as 'all' (backwards compatibility)
	 * - false: same as 'new' (backwards compatibility)
	 * @default 'new'
	 */
	updateSnapshots?: boolean | "all" | "new" | "none";

	/**
	 * Custom update command to display in error messages
	 * @default '--update'
	 */
	updateCommand?: string;

	/** Options for the core, core-wasm and core-native methods. The matcher manages `output`. */
	diff?: Omit<DiffOptions, "output">;

	/** Options for the ssim, msssim and hitchhikers-ssim methods. The matcher manages `output`. */
	ssim?: Omit<SsimOptions, "output">;

	/** Options for the gmsd method. The matcher manages `output`. */
	gmsd?: Omit<GmsdOptions, "output">;

	/**
	 * Run image I/O and comparison in a worker thread
	 * Worker threads provide better performance by avoiding V8 heap contention
	 * @default true
	 */
	runInWorker?: boolean;
}

/**
 * Result of a comparison operation
 */
export interface ComparisonResult {
	/** Whether the comparison passed */
	pass: boolean;

	/** Human-readable message describing the result */
	message: string;

	/** Number of different pixels (for pixel-based methods) */
	diffCount?: number;

	/** Percentage of different pixels */
	diffPercentage?: number;

	/** Similarity score (for SSIM/GMSD - 1 = identical for SSIM, 0 = identical for GMSD) */
	score?: number;

	/** Path to baseline snapshot */
	baselinePath?: string;

	/** Path to received image (saved for debugging) */
	receivedPath?: string;

	/** Path to diff visualization */
	diffPath?: string;

	/** Status of the snapshot operation */
	snapshotStatus?: SnapshotStatus;
}

/**
 * Context provided by test frameworks
 */
export interface TestContext {
	/** Absolute path to the test file */
	testPath: string;

	/** Name of the current test */
	testName: string;
}

/**
 * Image data with dimensions
 */
export interface ImageData {
	data: Uint8Array;
	width: number;
	height: number;
}
