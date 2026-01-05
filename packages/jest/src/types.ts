import type { MatcherOptions } from "@blazediff/matcher";

declare global {
	namespace jest {
		interface Matchers<R> {
			/**
			 * Compare an image against a stored snapshot.
			 *
			 * On first run, creates a new snapshot.
			 * On subsequent runs, compares against the stored snapshot.
			 *
			 * @param options - Matcher options including comparison method and thresholds
			 *
			 * @example
			 * ```typescript
			 * // Compare file path
			 * await expect('/path/to/screenshot.png').toMatchImageSnapshot({
			 *   method: 'bin',
			 *   failureThreshold: 100,
			 *   failureThresholdType: 'pixel',
			 * });
			 *
			 * // Compare image buffer
			 * await expect({
			 *   data: imageBuffer,
			 *   width: 800,
			 *   height: 600
			 * }).toMatchImageSnapshot({
			 *   method: 'ssim',
			 *   failureThreshold: 0.01,
			 *   failureThresholdType: 'percent',
			 * });
			 * ```
			 */
			toMatchImageSnapshot(options?: Partial<MatcherOptions>): Promise<R>;
		}

		interface Expect {
			toMatchImageSnapshot(options?: Partial<MatcherOptions>): void;
		}
	}
}
