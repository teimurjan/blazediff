import {
	getOrCreateSnapshot,
	type ImageInput,
	type MatcherOptions,
} from "@blazediff/matcher";
import { expect } from "vitest";

// Import type augmentation to ensure it's included in the build
import "./types";

// Re-export types for convenience
export type {
	ComparisonResult,
	ImageInput,
	MatcherOptions,
} from "@blazediff/matcher";

/**
 * Setup blazediff matchers for Vitest
 *
 * @example
 * ```typescript
 * // In your vitest setup file or test file
 * import { setupBlazediffMatchers } from '@blazediff/vitest';
 * setupBlazediffMatchers();
 *
 * // Or just import the package (auto-setup)
 * import '@blazediff/vitest';
 * ```
 */
export function setupBlazediffMatchers(): void {
	expect.extend({
		async toMatchImageSnapshot(
			received: ImageInput,
			options?: Partial<MatcherOptions>,
		) {
			// Get test context from Vitest
			const testPath = (this as any).testPath || "";
			const currentTestName = (this as any).currentTestName || "unknown";

			// Check for update flag from Vitest's snapshot state or environment
			// Vitest sets snapshotState._updateSnapshot to:
			// - 'new': default mode, create new snapshots (don't update existing)
			// - 'all': update mode (vitest -u), update all snapshots
			// - 'none': no updates
			const snapshotState = (this as any).snapshotState;
			const updateSnapshots =
				options?.updateSnapshots ||
				snapshotState?._updateSnapshot === "all" ||
				process.env.UPDATE_SNAPSHOTS === "true";

			const result = await getOrCreateSnapshot(
				received,
				{
					method: "core", // Default to core method
					...options,
					updateSnapshots,
				} as MatcherOptions,
				{
					testPath,
					testName: currentTestName,
				},
			);

			// Update Vitest snapshot state (uses CounterMap)
			if (snapshotState && result.snapshotStatus) {
				switch (result.snapshotStatus) {
					case "added":
						snapshotState.added.increment(currentTestName);
						(snapshotState as any)._dirty = true;
						break;
					case "updated":
						snapshotState.updated.increment(currentTestName);
						(snapshotState as any)._dirty = true;
						break;
					case "matched":
						snapshotState.matched.increment(currentTestName);
						break;
					case "failed":
						snapshotState.unmatched.increment(currentTestName);
						break;
				}
			}

			return {
				pass: result.pass,
				message: () => result.message,
				actual: result.receivedPath,
				expected: result.baselinePath,
			};
		},
	});
}

// Auto-setup when the module is imported
setupBlazediffMatchers();

export default setupBlazediffMatchers;
