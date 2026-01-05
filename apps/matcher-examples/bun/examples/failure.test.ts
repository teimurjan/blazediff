import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTestImage } from "../../utils";
import "@blazediff/bun";

const TEMP_DIR = join(
	import.meta.dir,
	"../snapshots/$(basename /Users/teimurgasanov/Projects/blazediff/blazediff/apps/matcher-examples/bun/examples/failure.test.ts .test.ts)",
);

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe.serial("Failure: Different Images", () => {
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
