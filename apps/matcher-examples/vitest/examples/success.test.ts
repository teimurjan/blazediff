import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestImage } from "../../utils";
import "@blazediff/vitest";

const TEMP_DIR = join(__dirname, "../snapshots/success");

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe.sequential("Success: Identical Images", () => {
	it("should create snapshot and match on second run", async () => {
		const img = createTestImage(50, 50, [255, 0, 0, 255]);

		// First run - creates snapshot
		await expect(img).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "identical-red",
		});

		// Second run - matches existing
		await expect(img).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "identical-red",
		});
	});
});
