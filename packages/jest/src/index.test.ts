import { join } from "node:path";
import "./index";

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
});
