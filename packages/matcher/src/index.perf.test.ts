import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getOrCreateSnapshot, isImageData, saveRawPNGBuffer } from "./index";
import type { TestContext } from "./types";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");
const TEMP_DIR = join(__dirname, "__perf_test_temp__");

function createTestContext(testName: string): TestContext {
	return {
		testPath: join(TEMP_DIR, "test.spec.ts"),
		testName,
	};
}

describe("Performance", () => {
	beforeEach(() => {
		if (!existsSync(TEMP_DIR)) {
			mkdirSync(TEMP_DIR, { recursive: true });
		}
	});

	afterEach(() => {
		if (existsSync(TEMP_DIR)) {
			rmSync(TEMP_DIR, { recursive: true, force: true });
		}
	});

	describe("first run optimization (direct buffer write)", () => {
		it("small image: direct write should be under 50ms", async () => {
			const pngBuffer = readFileSync(
				join(FIXTURES_PATH, "pixelmatch/1a.png"),
			);
			const testContext = createTestContext("perf-first-run-small");

			const start = performance.now();
			const result = await getOrCreateSnapshot(
				pngBuffer,
				{ method: "core" },
				testContext,
			);
			const elapsed = performance.now() - start;

			expect(result.pass).toBe(true);
			expect(result.snapshotStatus).toBe("added");
			expect(elapsed).toBeLessThan(50);
		});

		it("large image (10MB): direct write should be under 100ms", async () => {
			const pngBuffer = readFileSync(join(FIXTURES_PATH, "page/1a.png"));
			const testContext = createTestContext("perf-first-run-large");

			const start = performance.now();
			const result = await getOrCreateSnapshot(
				pngBuffer,
				{ method: "core" },
				testContext,
			);
			const elapsed = performance.now() - start;

			expect(result.pass).toBe(true);
			expect(result.snapshotStatus).toBe("added");
			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("comparison path (no double-normalization)", () => {
		it("small image comparison should be fast", async () => {
			const pngBuffer = readFileSync(
				join(FIXTURES_PATH, "pixelmatch/1a.png"),
			);
			const testContext = createTestContext("perf-comparison-small");

			// First run to create baseline
			await getOrCreateSnapshot(pngBuffer, { method: "core" }, testContext);

			// Second run measures comparison
			const start = performance.now();
			const result = await getOrCreateSnapshot(
				pngBuffer,
				{ method: "core" },
				testContext,
			);
			const elapsed = performance.now() - start;

			expect(result.pass).toBe(true);
			expect(result.snapshotStatus).toBe("matched");
			// Small image (512x256 = 131k pixels) should be under 100ms
			expect(elapsed).toBeLessThan(100);
		});

		it("runInWorker=false falls back to main thread", async () => {
			const pngBuffer = readFileSync(
				join(FIXTURES_PATH, "pixelmatch/1a.png"),
			);
			const testContext = createTestContext("perf-no-worker");

			// Create baseline
			await getOrCreateSnapshot(pngBuffer, { method: "core", runInWorker: false }, testContext);

			// Measure comparison without worker
			const start = performance.now();
			const result = await getOrCreateSnapshot(
				pngBuffer,
				{ method: "core", runInWorker: false },
				testContext,
			);
			const elapsed = performance.now() - start;

			expect(result.pass).toBe(true);
			expect(result.snapshotStatus).toBe("matched");
			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("utility functions", () => {
		it("saveRawPNGBuffer writes directly without decode/encode", () => {
			const pngBuffer = readFileSync(join(FIXTURES_PATH, "page/1a.png"));
			const outputPath = join(TEMP_DIR, "direct-write.png");

			const start = performance.now();
			saveRawPNGBuffer(outputPath, pngBuffer);
			const elapsed = performance.now() - start;

			expect(existsSync(outputPath)).toBe(true);
			// Writing 10MB file should be under 50ms
			expect(elapsed).toBeLessThan(50);

			const written = readFileSync(outputPath);
			expect(Buffer.compare(pngBuffer, written)).toBe(0);
		});

		it("isImageData type guard works correctly", () => {
			expect(
				isImageData({ data: new Uint8Array(4), width: 1, height: 1 }),
			).toBe(true);
			expect(isImageData(Buffer.from([1, 2, 3]))).toBe(false);
			expect(isImageData("/path/to/file.png")).toBe(false);
			// @ts-expect-error testing null input
			expect(isImageData(null)).toBe(false);
			// @ts-expect-error testing undefined input
			expect(isImageData(undefined)).toBe(false);
		});
	});
});
