import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compare } from "./index";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

describe("compare", () => {
	it("should return match: true for identical images", async () => {
		const imagePath = join(FIXTURES_PATH, "same/1a.png");
		const result = await compare(imagePath, imagePath);
		expect(result).toEqual({ match: true });
	});

	it("should return pixel-diff for images with same dimensions but different content", async () => {
		const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
		const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
		const result = await compare(path1, path2);

		expect(result.match).toBe(false);
		expect(result).toHaveProperty("reason", "pixel-diff");
		if (result.match === false && result.reason === "pixel-diff") {
			expect(result.diffCount).toBeGreaterThan(0);
			expect(result.diffPercentage).toBeGreaterThan(0);
		}
	});

	it("should return layout-diff for images with different dimensions", async () => {
		const smallImage = join(FIXTURES_PATH, "pixelmatch/1a.png"); // 512x256
		const largeImage = join(FIXTURES_PATH, "same/1a.png"); // 1498x1160
		const result = await compare(smallImage, largeImage);

		expect(result).toEqual({ match: false, reason: "layout-diff" });
	});

	it("should return file-not-exists when base image is missing", async () => {
		const missingPath = join(FIXTURES_PATH, "nonexistent.png");
		const existingPath = join(FIXTURES_PATH, "same/1a.png");
		const result = await compare(missingPath, existingPath);

		expect(result.match).toBe(false);
		expect(result).toHaveProperty("reason", "file-not-exists");
	});

	it("should return file-not-exists when compare image is missing", async () => {
		const existingPath = join(FIXTURES_PATH, "same/1a.png");
		const missingPath = join(FIXTURES_PATH, "nonexistent.png");
		const result = await compare(existingPath, missingPath);

		expect(result.match).toBe(false);
		expect(result).toHaveProperty("reason", "file-not-exists");
	});

	describe("options", () => {
		it("should respect threshold option", async () => {
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");

			const strictResult = await compare(path1, path2, undefined, {
				threshold: 0.01,
			});
			const lenientResult = await compare(path1, path2, undefined, {
				threshold: 0.5,
			});

			if (
				strictResult.match === false &&
				strictResult.reason === "pixel-diff" &&
				lenientResult.match === false &&
				lenientResult.reason === "pixel-diff"
			) {
				expect(strictResult.diffCount).toBeGreaterThanOrEqual(
					lenientResult.diffCount,
				);
			}
		});
	});
});
