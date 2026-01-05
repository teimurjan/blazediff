import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTestImage } from "../../utils";
import "@blazediff/bun";

const TEMP_DIR = join(
	import.meta.dir,
	"../snapshots/$(basename /Users/teimurgasanov/Projects/blazediff/blazediff/apps/matcher-examples/bun/examples/success.test.ts .test.ts)",
);

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe.serial("Success: Identical Images", () => {
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
