import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	compareImages,
	getOrCreateSnapshot,
	isFilePath,
	isImageBuffer,
	loadPNG,
	normalizeImageInput,
	runComparison,
	savePNG,
	validateMethodSupportsInput,
} from "./index";
import type { ImageData, MatcherOptions } from "./types";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");
const TEMP_DIR = join(__dirname, "__test_temp__");

function createTestImage(
	width: number,
	height: number,
	color: [number, number, number, number] = [128, 128, 128, 255],
): ImageData {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = color[0];
		data[i * 4 + 1] = color[1];
		data[i * 4 + 2] = color[2];
		data[i * 4 + 3] = color[3];
	}
	return { data, width, height };
}

async function saveTempPNG(name: string, img: ImageData): Promise<string> {
	const filePath = join(TEMP_DIR, name);
	await savePNG(filePath, img.data, img.width, img.height);
	return filePath;
}

describe("image-io", () => {
	beforeEach(() => {
		if (!existsSync(TEMP_DIR)) {
			mkdirSync(TEMP_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true });
		}
	});

	describe("isFilePath", () => {
		it("should return true for string paths", () => {
			expect(isFilePath("/path/to/image.png")).toBe(true);
			expect(isFilePath("relative/path.png")).toBe(true);
		});

		it("should return false for image buffers", () => {
			const img = createTestImage(10, 10);
			expect(isFilePath(img)).toBe(false);
		});
	});

	describe("isImageBuffer", () => {
		it("should return true for image data objects", () => {
			const img = createTestImage(10, 10);
			expect(isImageBuffer(img)).toBe(true);
		});

		it("should return false for strings", () => {
			expect(isImageBuffer("/path/to/image.png")).toBe(false);
		});

		it("should return false for invalid objects", () => {
			expect(isImageBuffer({ data: new Uint8Array(4) } as any)).toBe(false);
			expect(isImageBuffer({ width: 10, height: 10 } as any)).toBe(false);
		});
	});

	describe("loadPNG", () => {
		it("should load PNG from fixtures", async () => {
			const img = await loadPNG(join(FIXTURES_PATH, "same/1a.png"));
			expect(img.width).toBeGreaterThan(0);
			expect(img.height).toBeGreaterThan(0);
			expect(img.data.length).toBe(img.width * img.height * 4);
		});

		it("should throw for non-existent file", async () => {
			await expect(() => loadPNG("/non/existent/path.png")).rejects.toThrow(
				"not found",
			);
		});
	});

	describe("savePNG", () => {
		it("should save and load round-trip", async () => {
			const original = createTestImage(50, 50, [255, 0, 0, 255]);
			const filePath = await saveTempPNG("test-save.png", original);

			const loaded = await loadPNG(filePath);
			expect(loaded.width).toBe(original.width);
			expect(loaded.height).toBe(original.height);
			expect(loaded.data[0]).toBe(255); // Red channel
		});

		it("should create directories as needed", async () => {
			const img = createTestImage(10, 10);
			const deepPath = join(TEMP_DIR, "deep", "nested", "dir", "image.png");
			await savePNG(deepPath, img.data, img.width, img.height);
			expect(existsSync(deepPath)).toBe(true);
		});
	});

	describe("normalizeImageInput", () => {
		it("should load file path to ImageData", async () => {
			const filePath = join(FIXTURES_PATH, "same/1a.png");
			const result = await normalizeImageInput(filePath);
			expect(result.width).toBeGreaterThan(0);
			expect(result.height).toBeGreaterThan(0);
			expect(result.data).toBeInstanceOf(Uint8Array);
		});

		it("should normalize buffer input", async () => {
			const img = createTestImage(10, 10);
			const result = await normalizeImageInput(img);
			expect(result.width).toBe(10);
			expect(result.height).toBe(10);
			expect(result.data).toBeInstanceOf(Uint8Array);
		});
	});
});

describe("validateMethodSupportsInput", () => {
	it("should not throw for bin method with file path", () => {
		expect(() =>
			validateMethodSupportsInput("bin", "/path/to/image.png"),
		).not.toThrow();
	});

	it("should throw for bin method with buffer", () => {
		const img = createTestImage(10, 10);
		expect(() => validateMethodSupportsInput("bin", img)).toThrow(
			"Method 'bin' only supports file paths",
		);
	});

	it("should not throw for core method with buffer", () => {
		const img = createTestImage(10, 10);
		expect(() => validateMethodSupportsInput("core", img)).not.toThrow();
	});

	it("should not throw for ssim method with buffer", () => {
		const img = createTestImage(10, 10);
		expect(() => validateMethodSupportsInput("ssim", img)).not.toThrow();
	});
});

describe("runComparison", () => {
	describe("core method", () => {
		it("should return 0 diff for identical images", async () => {
			const img = createTestImage(100, 100);
			const result = await runComparison(img, img, "core", { method: "core" });
			expect(result.diffCount).toBe(0);
			expect(result.diffPercentage).toBe(0);
		});

		it("should detect differences", async () => {
			const img1 = createTestImage(100, 100, [0, 0, 0, 255]);
			const img2 = createTestImage(100, 100, [255, 255, 255, 255]);
			const result = await runComparison(img1, img2, "core", {
				method: "core",
			});
			expect(result.diffCount).toBe(10000);
			expect(result.diffPercentage).toBe(100);
		});

		it("should work with file paths", async () => {
			const samePath = join(FIXTURES_PATH, "same/1a.png");
			const result = await runComparison(samePath, samePath, "core", {
				method: "core",
			});
			expect(result.diffCount).toBe(0);
		});
	});

	describe("ssim method", () => {
		it("should return score 1 for identical images", async () => {
			const img = createTestImage(100, 100);
			const result = await runComparison(img, img, "ssim", { method: "ssim" });
			expect(result.score).toBeCloseTo(1, 2);
		});

		it("should return lower score for different images", async () => {
			const img1 = createTestImage(100, 100, [0, 0, 0, 255]);
			const img2 = createTestImage(100, 100, [255, 255, 255, 255]);
			const result = await runComparison(img1, img2, "ssim", {
				method: "ssim",
			});
			expect(result.score).toBeLessThan(0.5);
		});
	});

	describe("gmsd method", () => {
		it("should return score 0 for identical images", async () => {
			const img = createTestImage(100, 100);
			const result = await runComparison(img, img, "gmsd", { method: "gmsd" });
			expect(result.score).toBe(0);
		});

		it("should return higher score for different images with gradients", async () => {
			// GMSD needs gradients to detect differences - flat images have no gradients
			// Use real fixture images that have gradients
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
			const result = await runComparison(path1, path2, "gmsd", {
				method: "gmsd",
			});
			expect(result.score).toBeGreaterThan(0);
		});
	});

	describe("bin method", () => {
		beforeEach(() => {
			if (!existsSync(TEMP_DIR)) {
				mkdirSync(TEMP_DIR, { recursive: true });
			}
		});

		afterEach(() => {
			if (existsSync(TEMP_DIR)) {
				rmSync(TEMP_DIR, { recursive: true });
			}
		});

		it("should return 0 diff for identical file paths", async () => {
			const samePath = join(FIXTURES_PATH, "same/1a.png");
			const result = await runComparison(samePath, samePath, "bin", {
				method: "bin",
			});
			expect(result.diffCount).toBe(0);
		});

		it("should detect differences in file paths", async () => {
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
			const result = await runComparison(path1, path2, "bin", {
				method: "bin",
			});
			expect(result.diffCount).toBeGreaterThan(0);
		});

		it("should throw for buffer input", async () => {
			const img = createTestImage(10, 10);
			await expect(
				runComparison(img, img, "bin", { method: "bin" }),
			).rejects.toThrow("Method 'bin' only supports file paths");
		});
	});
});

describe("compareImages", () => {
	it("should pass for identical images", async () => {
		const img = createTestImage(100, 100);
		const result = await compareImages(img, img, { method: "core" });
		expect(result.pass).toBe(true);
	});

	it("should fail for different images", async () => {
		const img1 = createTestImage(100, 100, [0, 0, 0, 255]);
		const img2 = createTestImage(100, 100, [255, 255, 255, 255]);
		const result = await compareImages(img1, img2, { method: "core" });
		expect(result.pass).toBe(false);
	});

	it("should respect pixel threshold", async () => {
		const img1 = createTestImage(100, 100, [0, 0, 0, 255]);
		const img2 = createTestImage(100, 100, [0, 0, 0, 255]);
		// Change just 10 pixels
		for (let i = 0; i < 10; i++) {
			img2.data[i * 4] = 255;
			img2.data[i * 4 + 1] = 255;
			img2.data[i * 4 + 2] = 255;
		}

		// Should fail with threshold 0
		const result1 = await compareImages(img1, img2, {
			method: "core",
			failureThreshold: 0,
		});
		expect(result1.pass).toBe(false);

		// Should pass with threshold 10
		const result2 = await compareImages(img1, img2, {
			method: "core",
			failureThreshold: 10,
		});
		expect(result2.pass).toBe(true);
	});

	it("should respect percent threshold", async () => {
		const img1 = createTestImage(100, 100, [0, 0, 0, 255]);
		const img2 = createTestImage(100, 100, [0, 0, 0, 255]);
		// Change 100 pixels (1%)
		for (let i = 0; i < 100; i++) {
			img2.data[i * 4] = 255;
		}

		const result = await compareImages(img1, img2, {
			method: "core",
			failureThreshold: 2,
			failureThresholdType: "percent",
		});
		expect(result.pass).toBe(true);
	});
});

describe("getOrCreateSnapshot", () => {
	const testContext = {
		testPath: join(TEMP_DIR, "test-file.test.ts"),
		testName: "should match snapshot",
	};

	beforeEach(() => {
		if (!existsSync(TEMP_DIR)) {
			mkdirSync(TEMP_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true });
		}
	});

	it("should create new snapshot when none exists", async () => {
		const img = createTestImage(50, 50, [255, 0, 0, 255]);
		const result = await getOrCreateSnapshot(
			img,
			{ method: "core" },
			testContext,
		);

		expect(result.pass).toBe(true);
		expect(result.message).toContain("New snapshot created");
		expect(result.baselinePath).toBeDefined();
		expect(existsSync(result.baselinePath!)).toBe(true);
	});

	it("should match existing snapshot", async () => {
		const img = createTestImage(50, 50, [255, 0, 0, 255]);

		// First call creates snapshot
		await getOrCreateSnapshot(img, { method: "core" }, testContext);

		// Second call should match
		const result = await getOrCreateSnapshot(
			img,
			{ method: "core" },
			testContext,
		);
		expect(result.pass).toBe(true);
		expect(result.message).toContain("Image matches snapshot");
	});

	it("should fail when image differs from snapshot", async () => {
		const img1 = createTestImage(50, 50, [255, 0, 0, 255]);
		const img2 = createTestImage(50, 50, [0, 255, 0, 255]);

		// Create snapshot with first image
		await getOrCreateSnapshot(img1, { method: "core" }, testContext);

		// Second call with different image should fail
		const result = await getOrCreateSnapshot(
			img2,
			{ method: "core" },
			testContext,
		);
		expect(result.pass).toBe(false);
		expect(result.message).toContain("mismatch");
		expect(result.receivedPath).toBeDefined();
		expect(result.diffPath).toBeDefined();
	});

	it("should update snapshot in update mode", async () => {
		const img1 = createTestImage(50, 50, [255, 0, 0, 255]);
		const img2 = createTestImage(50, 50, [0, 255, 0, 255]);

		// Create snapshot with first image
		await getOrCreateSnapshot(img1, { method: "core" }, testContext);

		// Update with second image
		const result = await getOrCreateSnapshot(
			img2,
			{ method: "core", updateSnapshots: true },
			testContext,
		);
		expect(result.pass).toBe(true);

		// Verify new snapshot matches second image
		const matchResult = await getOrCreateSnapshot(
			img2,
			{ method: "core" },
			testContext,
		);
		expect(matchResult.pass).toBe(true);
	});

	it("should use custom snapshot identifier", async () => {
		const img = createTestImage(50, 50);
		const result = await getOrCreateSnapshot(
			img,
			{ method: "core", snapshotIdentifier: "custom-name" },
			testContext,
		);

		expect(result.baselinePath).toContain("custom-name.png");
	});

	it("should use custom snapshots directory", async () => {
		const img = createTestImage(50, 50);
		const result = await getOrCreateSnapshot(
			img,
			{ method: "core", snapshotsDir: "custom-snapshots" },
			testContext,
		);

		expect(result.baselinePath).toContain("custom-snapshots");
	});

	it("should work with file path input", async () => {
		// Create a temp image file
		const img = createTestImage(50, 50, [128, 128, 128, 255]);
		const tempImagePath = await saveTempPNG("input-image.png", img);

		const result = await getOrCreateSnapshot(
			tempImagePath,
			{ method: "core" },
			testContext,
		);

		expect(result.pass).toBe(true);
	});

	it("should respect threshold when comparing snapshots", async () => {
		const img1 = createTestImage(50, 50, [100, 100, 100, 255]);

		// Create snapshot
		await getOrCreateSnapshot(img1, { method: "core" }, testContext);

		// Slightly different image (10 pixels changed)
		const img2 = createTestImage(50, 50, [100, 100, 100, 255]);
		for (let i = 0; i < 10; i++) {
			img2.data[i * 4] = 255;
		}

		// Should fail without threshold
		const result1 = await getOrCreateSnapshot(
			img2,
			{ method: "core", failureThreshold: 0 },
			testContext,
		);
		expect(result1.pass).toBe(false);

		// Should pass with threshold
		const result2 = await getOrCreateSnapshot(
			img2,
			{ method: "core", failureThreshold: 10 },
			testContext,
		);
		expect(result2.pass).toBe(true);
	});
});

describe("integration with real fixtures", () => {
	it("should correctly compare identical images", async () => {
		const samePath = join(FIXTURES_PATH, "same/1a.png");
		const result = await compareImages(samePath, samePath, { method: "core" });
		expect(result.pass).toBe(true);
		expect(result.diffCount).toBe(0);
	});

	it("should detect differences in pixelmatch fixtures", async () => {
		const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
		const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
		const result = await compareImages(path1, path2, { method: "core" });
		expect(result.pass).toBe(false);
		expect(result.diffCount).toBeGreaterThan(0);
	});

	it("should work with all comparison methods on fixtures", async () => {
		const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
		const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");

		const methods: Array<MatcherOptions["method"]> = [
			"core",
			"ssim",
			"hitchhikers-ssim",
			"gmsd",
			"bin",
		];

		for (const method of methods) {
			const result = await compareImages(path1, path2, { method });
			// All methods should detect the images are different
			expect(result.pass).toBe(false);
		}
	});
});
