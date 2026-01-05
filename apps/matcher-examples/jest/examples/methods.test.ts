import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
// Using global jest APIs: afterEach, beforeEach, describe, expect, it
import { createTestImage } from "../../utils";

const TEMP_DIR = join(
	__dirname,
	"../snapshots/$(basename /Users/teimurgasanov/Projects/blazediff/blazediff/apps/matcher-examples/jest/examples/methods.test.ts .test.ts)",
);

afterEach(() => {
	if (existsSync(TEMP_DIR)) {
		rmSync(TEMP_DIR, { recursive: true, force: true });
	}
});

describe("Methods: Different Comparison Algorithms", () => {
	it("should work with core method", async () => {
		const img = createTestImage(50, 50, [100, 150, 200, 255]);
		await expect(img).toMatchImageSnapshot({
			method: "core",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "method-core",
		});
	});

	it("should work with ssim method", async () => {
		const img = createTestImage(50, 50, [100, 150, 200, 255]);
		await expect(img).toMatchImageSnapshot({
			method: "ssim",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "method-ssim",
		});
	});

	it("should work with gmsd method", async () => {
		const img = createTestImage(50, 50, [100, 150, 200, 255]);
		await expect(img).toMatchImageSnapshot({
			method: "gmsd",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "method-gmsd",
		});
	});

	it("should work with hitchhikers-ssim method", async () => {
		const img = createTestImage(50, 50, [100, 150, 200, 255]);
		await expect(img).toMatchImageSnapshot({
			method: "hitchhikers-ssim",
			snapshotsDir: TEMP_DIR,
			snapshotIdentifier: "method-hitchhikers",
		});
	});
});
