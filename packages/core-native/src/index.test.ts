import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { compare, getBinaryPath, hasNativeBinding, interpret } from "./index";

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

	it.each([
		["PNG", "pixelmatch/1a.png"],
		["JPEG", "4k-jpeg/1a.jpg"],
		["QOI", "4k-qoi/1a.qoi"],
	])("should compare encoded %s Buffer inputs", async (_, relativePath) => {
		const image = await readFile(join(FIXTURES_PATH, relativePath));
		await expect(compare(image, image)).resolves.toEqual({ match: true });
	});

	it("should compare Uint8Array views with non-zero offsets", async () => {
		const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
		const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
		const [image1, image2, pathResult] = await Promise.all([
			readFile(path1),
			readFile(path2),
			compare(path1, path2),
		]);
		const storage1 = new Uint8Array(image1.length + 8);
		const storage2 = new Uint8Array(image2.length + 8);
		storage1.set(image1, 4);
		storage2.set(image2, 4);

		const bufferResult = await compare(
			storage1.subarray(4, image1.length + 4),
			storage2.subarray(4, image2.length + 4),
		);
		expect(bufferResult).toEqual(pathResult);
	});

	it("should interpret encoded Buffer inputs", async () => {
		const [image1, image2] = await Promise.all([
			readFile(join(FIXTURES_PATH, "pixelmatch/1a.png")),
			readFile(join(FIXTURES_PATH, "pixelmatch/1b.png")),
		]);
		const result = await interpret(image1, image2);

		expect(result.diffCount).toBeGreaterThan(0);
		expect(result.totalRegions).toBeGreaterThan(0);
	});

	it("should reject mixed path and byte array inputs", async () => {
		const imagePath = join(FIXTURES_PATH, "pixelmatch/1a.png");
		const image = await readFile(imagePath);

		await expect(compare(imagePath, image)).rejects.toThrow(
			"Image inputs must both be file paths or both be encoded byte arrays",
		);
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

		it("should apply diffColorAlt to darkening changes", async () => {
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
			const tempDir = await mkdtemp(join(tmpdir(), "blazediff-native-alt-"));

			try {
				const directions = [
					[path1, path2, "forward"],
					[path2, path1, "reverse"],
				] as const;
				const outputsDiffer = await Promise.all(
					directions.map(async ([base, actual, name]) => {
						const defaultOutput = join(tempDir, `${name}-default.png`);
						const altOutput = join(tempDir, `${name}-alt.png`);
						await compare(base, actual, defaultOutput);
						await compare(base, actual, altOutput, {
							diffColorAlt: [0, 128, 255],
						});
						const [defaultBytes, altBytes] = await Promise.all([
							readFile(defaultOutput),
							readFile(altOutput),
						]);
						return !defaultBytes.equals(altBytes);
					}),
				);

				expect(outputsDiffer.some(Boolean)).toBe(true);
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});

		it("should reject invalid diffColorAlt channels", async () => {
			const imagePath = join(FIXTURES_PATH, "same/1a.png");

			await expect(
				compare(imagePath, imagePath, undefined, {
					diffColorAlt: [0, 256, 0],
				}),
			).rejects.toThrow("diffColorAlt must contain three integer RGB channels");
		});

		it("should write the same diff while returning interpretation", async () => {
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
			const tempDir = await mkdtemp(
				join(tmpdir(), "blazediff-native-combined-"),
			);

			try {
				const standaloneOutput = join(tempDir, "standalone.png");
				const combinedOutput = join(tempDir, "combined.png");
				const options = {
					diffColorAlt: [0, 128, 255] as [number, number, number],
				};
				await compare(path1, path2, standaloneOutput, options);
				const result = await compare(path1, path2, combinedOutput, {
					...options,
					interpret: true,
				});

				expect(result.match).toBe(false);
				if (!result.match && result.reason === "pixel-diff") {
					expect(result.interpretation?.diffCount).toBe(result.diffCount);
				}
				const [standaloneBytes, combinedBytes] = await Promise.all([
					readFile(standaloneOutput),
					readFile(combinedOutput),
				]);
				expect(combinedBytes).toEqual(standaloneBytes);
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});

		it("should support combined output in the CLI fallback", async () => {
			const path1 = join(FIXTURES_PATH, "pixelmatch/1a.png");
			const path2 = join(FIXTURES_PATH, "pixelmatch/1b.png");
			const tempDir = await mkdtemp(join(tmpdir(), "blazediff-cli-combined-"));
			const output = join(tempDir, "combined.png");

			try {
				let stdout = "";
				try {
					await execFileAsync(getBinaryPath(), [
						path1,
						path2,
						output,
						"--interpret",
						"--diff-color-alt=0,128,255",
						"--output-format=json",
					]);
				} catch (error) {
					const failure = error as { code?: number; stdout?: string };
					expect(failure.code).toBe(1);
					stdout = failure.stdout ?? "";
				}

				const interpretation = JSON.parse(stdout) as { diffCount: number };
				expect(interpretation.diffCount).toBeGreaterThan(0);
				expect((await readFile(output)).length).toBeGreaterThan(0);
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});
	});

	describe("memory", () => {
		it(
			"should not leak memory after repeated comparisons",
			{ timeout: 30000 },
			async () => {
				const path1 = join(FIXTURES_PATH, "4k/1a.png");
				const path2 = join(FIXTURES_PATH, "4k/1b.png");
				const iterations = 5;

				console.log(
					`[memory test] Using native binding: ${hasNativeBinding()}`,
				);

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
			},
		);

		it(
			"should not leak memory with CLI (execFile) path",
			{ timeout: 60000 },
			async () => {
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
						await execFileAsync(binaryPath, [
							path1,
							path2,
							"--output-format=json",
						]);
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
				console.log(
					`[memory test CLI] RSS growth: ${rssGrowthMB.toFixed(2)} MB`,
				);

				// CLI spawns separate processes, so Node.js RSS shouldn't grow much
				expect(rssGrowthMB).toBeLessThan(50);
			},
		);
	});
});
