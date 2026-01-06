import {
	getOrCreateSnapshot,
	type ImageInput,
	type MatcherOptions,
} from "@blazediff/matcher";

// Re-export types for convenience
// Import type augmentation to ensure it's included in the build
import "./types";

export type {
	ComparisonResult,
	ImageInput,
	MatcherOptions,
} from "@blazediff/matcher";

/**
 * Jest matcher for image snapshot comparison
 */
async function toMatchImageSnapshot(
	this: jest.MatcherContext,
	received: ImageInput,
	options?: Partial<MatcherOptions>,
): Promise<jest.CustomMatcherResult> {
	const { testPath, currentTestName, snapshotState } = this;

	const updateSnapshots =
		options?.updateSnapshots ||
		process.env.JEST_UPDATE_SNAPSHOTS === "true" ||
		process.argv.includes("-u") ||
		process.argv.includes("--updateSnapshot");

	const result = await getOrCreateSnapshot(
		received,
		{
			method: "core",
			...options,
			updateSnapshots,
			updateCommand: "-u or JEST_UPDATE_SNAPSHOTS=true",
		} as MatcherOptions,
		{
			testPath: testPath || "",
			testName: currentTestName || "unknown",
		},
	);

	// Update Jest snapshot state based on snapshotStatus
	if (snapshotState && result.snapshotStatus) {
		switch (result.snapshotStatus) {
			case "added":
				snapshotState.added++;
				(snapshotState as any)._dirty = true;
				break;
			case "updated":
				snapshotState.updated++;
				(snapshotState as any)._dirty = true;
				break;
			case "matched":
				snapshotState.matched++;
				break;
			case "failed":
				snapshotState.unmatched++;
				break;
		}
	}

	return {
		pass: result.pass,
		message: () => result.message,
	};
}

/**
 * Setup blazediff matchers for Jest
 *
 * @example
 * ```typescript
 * // In your jest setup file
 * import { setupBlazediffMatchers } from '@blazediff/jest';
 * setupBlazediffMatchers();
 *
 * // Or just import the package (auto-setup)
 * import '@blazediff/jest';
 * ```
 */
export function setupBlazediffMatchers(): void {
	expect.extend({
		toMatchImageSnapshot,
	});
}

// Auto-setup when the module is imported
setupBlazediffMatchers();

export default setupBlazediffMatchers;
