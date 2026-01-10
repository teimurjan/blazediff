/**
 * Comparison methods available in blazediff
 */
export type ComparisonMethod =
	| "bin" // @blazediff/bin (Rust N-API, file paths only)
	| "core" // @blazediff/core (pixel-by-pixel YIQ)
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

	// Method-specific options passed through to comparators

	/**
	 * Color difference threshold for core/bin methods (0-1)
	 * Lower = more strict
	 * @default 0.1
	 */
	threshold?: number;

	/**
	 * Enable anti-aliasing detection (bin method)
	 * @default false
	 */
	antialiasing?: boolean;

	/**
	 * Include anti-aliased pixels in diff count (core method)
	 * @default false
	 */
	includeAA?: boolean;

	/**
	 * Window size for SSIM variants
	 * @default 11
	 */
	windowSize?: number;

	/**
	 * k1 constant for SSIM
	 * @default 0.01
	 */
	k1?: number;

	/**
	 * k2 constant for SSIM
	 * @default 0.03
	 */
	k2?: number;

	/**
	 * Downsample factor for GMSD (0 or 1)
	 * @default 0
	 */
	downsample?: 0 | 1;
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
