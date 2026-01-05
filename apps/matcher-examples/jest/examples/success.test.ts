import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createTestImage } from "../../utils";

const TEMP_DIR = join(
	__dirname,
	"../snapshots/$(basename /Users/teimurgasanov/Projects/blazediff/blazediff/apps/matcher-examples/jest/examples/success.test.ts .test.ts)",
);

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe("Success: Identical Images", () => {
	it("should create snapshot and match on second run", async () => {
		const img = createTestImage(50, 50, [255, 0, 0, 255]);

		await expect(img).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "identical-red",
		});

		await expect(img).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "identical-red",
		});
	});
});
