import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestImage } from "../../utils";
import "@blazediff/vitest";

const TEMP_DIR = join(__dirname, "../snapshots/update");

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe.sequential("Update: Snapshot Update Mode", () => {
	it("should update snapshot when updateSnapshots is true", async () => {
		const redImage = createTestImage(50, 50, [255, 0, 0, 255]);
		const greenImage = createTestImage(50, 50, [0, 255, 0, 255]);

		// Create initial snapshot with red
		await expect(redImage).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "update-demo",
		});

		// Update with green image
		await expect(greenImage).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "update-demo",
			updateSnapshots: true,
		});

		// Verify green now matches
		await expect(greenImage).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "update-demo",
		});
	});
});
