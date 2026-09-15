/**
 * The contract every vision backend implements, plus the holder that keeps one
 * loaded instance per judge.
 *
 * Step 1 of the local judge reads changed regions through a `VisionRunner`. Which
 * model does the reading is the judge's choice, not this module's: see
 * `local-moondream-2-2b-onnx.ts` (in-process ONNX) and
 * `local-moondream-3-9b-mlx.ts` (managed Moondream Station).
 */

export interface VisionRunner {
	/** Answer `question` about the image at `imagePath`; returns the model's text. */
	describe(imagePath: string, question: string): Promise<string>;
}

export type VisionRunnerFactory = () => Promise<VisionRunner>;

export interface VisionRunnerHolder {
	/** Loads (or returns the cached) runner; multiple callers share one model. */
	get(): Promise<VisionRunner>;
}

/**
 * Create a fresh holder. The first `get()` invokes `factory` and memoizes the
 * resulting promise; subsequent calls reuse it. Construct one per judge
 * instance — the model modules build the real ones; tests inject their own.
 */
export function createVisionRunnerHolder(
	factory: VisionRunnerFactory,
): VisionRunnerHolder {
	let runnerPromise: Promise<VisionRunner> | undefined;
	return {
		get() {
			if (!runnerPromise) runnerPromise = factory();
			return runnerPromise;
		},
	};
}
