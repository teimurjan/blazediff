import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadPNG } from "@blazediff/matcher";
import "./index"; // This sets up the matchers

const FIXTURES_PATH = join(__dirname, "../../../fixtures");
const TEMP_DIR = join(__dirname, "__test_snapshots__");

function createTestImage(
	width: number,
	height: number,
	color: [number, number, number, number] = [128, 128, 128, 255],
): { data: Uint8Array; width: number; height: number } {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = color[0];
		data[i * 4 + 1] = color[1];
		data[i * 4 + 2] = color[2];
		data[i * 4 + 3] = color[3];
	}
	return { data, width, height };
}

describe("toMatchImageSnapshot", () => {
	beforeEach(() => {
		// Clean up any existing snapshots
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		// Clean up after tests
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true });
		}
	});

	describe("with buffer input", () => {
		it("should create snapshot on first run", async () => {
			const img = createTestImage(50, 50, [255, 0, 0, 255]);
			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-first-run",
			});
		});

		it("should match existing snapshot", async () => {
			const img = createTestImage(50, 50, [0, 255, 0, 255]);

			// First run creates snapshot
			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-match",
			});

			// Second run should match
			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-match",
			});
		});

		it("should fail when image differs", async () => {
			const img1 = createTestImage(50, 50, [255, 0, 0, 255]);
			const img2 = createTestImage(50, 50, [0, 0, 255, 255]);

			// Create snapshot
			await expect(img1).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-differ",
			});

			// Different image should fail
			await expect(
				expect(img2).toMatchImageSnapshot({
					method: "core",
					snapshotsDir: TEMP_DIR,
					snapshotIdentifier: "buffer-differ",
				}),
			).rejects.toThrow();
		});

		it("should respect threshold", async () => {
			const img1 = createTestImage(100, 100, [100, 100, 100, 255]);

			// Create snapshot
			await expect(img1).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-threshold",
			});

			// Slightly different image (10 pixels changed)
			const img2 = createTestImage(100, 100, [100, 100, 100, 255]);
			for (let i = 0; i < 10; i++) {
				img2.data[i * 4] = 255;
			}

			// Should pass with sufficient threshold
			await expect(img2).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "buffer-threshold",
				failureThreshold: 10,
			});
		});
	});

	describe("with file path input", () => {
		it("should work with file paths", async () => {
			const imagePath = join(FIXTURES_PATH, "same/1a.png");

			await expect(imagePath).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "file-path-test",
			});
		});

		it("should work with bin method for file paths", async () => {
			const imagePath = join(FIXTURES_PATH, "same/1a.png");

			await expect(imagePath).toMatchImageSnapshot({
				method: "bin",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "file-path-bin",
			});
		});
	});

	describe("with different methods", () => {
		it("should work with core method", async () => {
			const img = createTestImage(50, 50);
			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "method-core",
			});
		});

		it("should work with ssim method", async () => {
			const img = createTestImage(50, 50);
			await expect(img).toMatchImageSnapshot({
				method: "ssim",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "method-ssim",
			});
		});

		it("should work with gmsd method", async () => {
			const img = createTestImage(50, 50);
			await expect(img).toMatchImageSnapshot({
				method: "gmsd",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "method-gmsd",
			});
		});
	});

	describe("update mode", () => {
		it("should update snapshot when updateSnapshots is true", async () => {
			const img1 = createTestImage(50, 50, [255, 0, 0, 255]);
			const img2 = createTestImage(50, 50, [0, 255, 0, 255]);

			// Create initial snapshot
			await expect(img1).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "update-mode",
			});

			// Update with new image
			await expect(img2).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "update-mode",
				updateSnapshots: true,
			});

			// New image should now match
			await expect(img2).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "update-mode",
			});
		});
	});

	describe("integration with fixtures", () => {
		it("should correctly compare identical images from fixtures", async () => {
			const img = loadPNG(join(FIXTURES_PATH, "same/1a.png"));

			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "fixture-identical",
			});

			// Same image should match
			await expect(img).toMatchImageSnapshot({
				method: "core",
				snapshotsDir: TEMP_DIR,
				snapshotIdentifier: "fixture-identical",
			});
		});
	});
});
