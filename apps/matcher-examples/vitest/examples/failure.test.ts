import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createTestImage } from "../../utils";
import "@blazediff/vitest";

const TEMP_DIR = join(__dirname, "../snapshots/failure");

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe.sequential("Failure: Different Images", () => {
	it("should fail when images differ", async () => {
		const redImage = createTestImage(50, 50, [255, 0, 0, 255]);
		const blueImage = createTestImage(50, 50, [0, 0, 255, 255]);

		// Create snapshot with red image
		await expect(redImage).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "different-colors",
		});

		// Try to match with blue image - should fail
		await expect(blueImage).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "different-colors",
		});
	});
});
