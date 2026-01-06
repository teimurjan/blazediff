import { expect } from "bun:test";
import {
	getOrCreateSnapshot,
	type ImageInput,
	type MatcherOptions,
} from "@blazediff/matcher";

// Import type augmentation to ensure it's included in the build
import "./types";

// Re-export types for convenience
export type {
	ComparisonResult,
	ImageInput,
	MatcherOptions,
} from "@blazediff/matcher";

/**
 * Setup blazediff matchers for Bun test
 *
 * @example
 * ```typescript
 * // In your test file
 * import { setupBlazediffMatchers } from '@blazediff/bun';
 * setupBlazediffMatchers();
 *
 * // Or just import the package (auto-setup)
 * import '@blazediff/bun';
 * ```
 */
export function setupBlazediffMatchers(): void {
	expect.extend({
		toMatchImageSnapshot: async function toMatchImageSnapshot(
			received: unknown,
			options?: Partial<MatcherOptions>,
		) {
			// Bun's test context is limited - we need to extract from stack trace or use defaults
			// Get test file path from Bun.main or stack trace
			const testPath = getTestPath();
			const testName = options?.snapshotIdentifier || "snapshot";

			// Check for update flag from environment
			const updateSnapshots =
				options?.updateSnapshots ||
				process.env.BUN_UPDATE_SNAPSHOTS === "true" ||
				Bun.argv.includes("-u") ||
				Bun.argv.includes("--update-snapshots");

			const result = await getOrCreateSnapshot(
				received as ImageInput,
				{
					method: "core",
					...options,
					updateSnapshots,
					updateCommand: "--update-snapshots or BUN_UPDATE_SNAPSHOTS=true",
				} as MatcherOptions,
				{
					testPath,
					testName,
				},
			);

			// Attempt to update Bun snapshot state (if exposed)
			const snapshotState = (this as any).snapshotState;
			if (snapshotState && result.snapshotStatus) {
				switch (result.snapshotStatus) {
					case "added":
						snapshotState.added = (snapshotState.added || 0) + 1;
						break;
					case "updated":
						snapshotState.updated = (snapshotState.updated || 0) + 1;
						break;
					case "matched":
						snapshotState.matched = (snapshotState.matched || 0) + 1;
						break;
					case "failed":
						snapshotState.unmatched = (snapshotState.unmatched || 0) + 1;
						break;
				}
			}

			return {
				pass: result.pass,
				message: () => result.message,
			};
		},
	});
}

/**
 * Get the test file path from Bun context or stack trace
 */
function getTestPath(): string {
	// Try Bun.main first
	if (typeof Bun !== "undefined" && Bun.main) {
		return Bun.main;
	}

	// Fallback: try to extract from stack trace
	const stack = new Error().stack;
	if (stack) {
		const lines = stack.split("\n");
		for (const line of lines) {
			const match = line.match(/at\s+(.+\.test\.[tj]s)/);
			if (match) {
				return match[1];
			}
		}
	}

	return "unknown";
}

// Auto-setup when the module is imported
setupBlazediffMatchers();

export default setupBlazediffMatchers;
