import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compare, getBinaryPath, hasNativeBinding } from "./index";

const execFileAsync = promisify(execFile);

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

	describe("memory", () => {
		it("should not leak memory after repeated comparisons", { timeout: 30000 }, async () => {
			const path1 = join(FIXTURES_PATH, "4k/1a.png");
			const path2 = join(FIXTURES_PATH, "4k/1b.png");
			const iterations = 5;

			console.log(`[memory test] Using native binding: ${hasNativeBinding()}`);

			// Force GC if available
			if (global.gc) {
				global.gc();
			}

			const initialMemory = process.memoryUsage();
			console.log(
				`[memory test] Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB, heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
			);

			// Run multiple comparisons (no output image to isolate the leak)
			for (let i = 0; i < iterations; i++) {
				await compare(path1, path2, undefined, {
					antialiasing: true,
				});

				if (global.gc) {
					global.gc();
				}

				const currentMemory = process.memoryUsage();
				console.log(
					`[memory test] Iteration ${i + 1}: RSS ${(currentMemory.rss / 1024 / 1024).toFixed(2)} MB, heap ${(currentMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
				);
			}

			// Force final GC
			if (global.gc) {
				global.gc();
			}

			const finalMemory = process.memoryUsage();
			console.log(
				`[memory test] Final RSS: ${(finalMemory.rss / 1024 / 1024).toFixed(2)} MB, heap: ${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
			);

			const rssGrowth = finalMemory.rss - initialMemory.rss;
			const rssGrowthMB = rssGrowth / 1024 / 1024;
			console.log(`[memory test] RSS growth: ${rssGrowthMB.toFixed(2)} MB`);

			// Allow up to 200MB RSS growth for first allocation (2 images + buffers)
			// 4K images are ~33MB each = 66MB for 2 images + decoding buffers
			// Key: RSS should NOT grow with each iteration after first
			// If leaking, we'd see 100MB+ growth PER ITERATION
			expect(rssGrowthMB).toBeLessThan(200);
		});

		it("should not leak memory with CLI (execFile) path", { timeout: 60000 }, async () => {
			const path1 = join(FIXTURES_PATH, "4k/1a.png");
			const path2 = join(FIXTURES_PATH, "4k/1b.png");
			const iterations = 50;
			const binaryPath = getBinaryPath();

			console.log(`[memory test CLI] Binary path: ${binaryPath}`);

			if (global.gc) {
				global.gc();
			}

			const initialMemory = process.memoryUsage();
			console.log(
				`[memory test CLI] Initial RSS: ${(initialMemory.rss / 1024 / 1024).toFixed(2)} MB`,
			);

			for (let i = 0; i < iterations; i++) {
				try {
					await execFileAsync(binaryPath, [path1, path2, "--output-format=json"]);
				} catch {
					// Exit code 1 = images differ, that's fine
				}

				if (global.gc) {
					global.gc();
				}

				const currentMemory = process.memoryUsage();
				console.log(
					`[memory test CLI] Iteration ${i + 1}: RSS ${(currentMemory.rss / 1024 / 1024).toFixed(2)} MB`,
				);
			}

			if (global.gc) {
				global.gc();
			}

			const finalMemory = process.memoryUsage();
			const rssGrowth = finalMemory.rss - initialMemory.rss;
			const rssGrowthMB = rssGrowth / 1024 / 1024;
			console.log(`[memory test CLI] RSS growth: ${rssGrowthMB.toFixed(2)} MB`);

			// CLI spawns separate processes, so Node.js RSS shouldn't grow much
			expect(rssGrowthMB).toBeLessThan(50);
		});
	});
});
