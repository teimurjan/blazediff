import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { diff as coreDiff } from "@blazediff/core";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
	BlazeDiffError,
	diff,
	getBinaryPath,
	hasNativeBinding,
	type NativeDiffOptions,
} from "./index";

const execFileAsync = promisify(execFile);

const FIXTURES_PATH = join(__dirname, "../../../../fixtures");
const fixture = (relative: string) => join(FIXTURES_PATH, relative);

function rawImage(relative: string) {
	const png = PNG.sync.read(readFileSync(fixture(relative)));
	return {
		data: new Uint8Array(png.data),
		width: png.width,
		height: png.height,
	};
}

async function withTempDir<T>(run: (dir: string) => Promise<T>): Promise<T> {
	const dir = await mkdtemp(join(tmpdir(), "blazediff-native-"));
	try {
		return await run(dir);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

describe("diff", () => {
	it("loads the N-API binding in this repo", () => {
		expect(hasNativeBinding()).toBe(true);
	});

	it("reports identical images", async () => {
		const path = fixture("same/1a.png");
		expect(await diff(path, path)).toEqual({
			kind: "compared",
			count: 0,
			percentage: 0,
			identical: true,
		});
	});

	it("fills the output of an identical pair like @blazediff/core", async () => {
		const a = rawImage("pixelmatch/1a.png");
		const copy = { ...a, data: new Uint8Array(a.data) };
		const nativeOut = { ...a, data: new Uint8Array(a.data.length).fill(7) };
		const coreOut = { ...a, data: new Uint8Array(a.data.length).fill(7) };
		await diff(a, copy, { output: nativeOut });
		coreDiff(a, copy, { output: coreOut });
		expect(Buffer.compare(nativeOut.data, coreOut.data)).toBe(0);
	});

	it("counts differing pixels", async () => {
		const result = await diff(
			fixture("pixelmatch/1a.png"),
			fixture("pixelmatch/1b.png"),
		);
		expect(result.kind).toBe("compared");
		if (result.kind !== "compared") return;
		expect(result.count).toBeGreaterThan(0);
		expect(result.percentage).toBeCloseTo((100 * result.count) / (512 * 256));
		expect(result.identical).toBe(false);
	});

	it("returns a dimension mismatch for different sizes", async () => {
		expect(
			await diff(fixture("pixelmatch/1a.png"), fixture("same/1a.png")),
		).toEqual({
			kind: "dimension-mismatch",
			a: { width: 512, height: 256 },
			b: { width: 1498, height: 1160 },
		});
	});

	it.each([
		["PNG", "pixelmatch/1a.png"],
		["JPEG", "4k-jpeg/1a.jpg"],
		["QOI", "4k-qoi/1a.qoi"],
	])("compares encoded %s Buffer inputs", async (_, relativePath) => {
		const image = await readFile(fixture(relativePath));
		const result = await diff(image, image);
		expect(result.kind === "compared" && result.identical).toBe(true);
	});

	it("gives the same result for paths, encoded views with offsets, raw images and mixes", async () => {
		const pathA = fixture("pixelmatch/1a.png");
		const pathB = fixture("pixelmatch/1b.png");
		const [bytesA, bytesB] = await Promise.all([
			readFile(pathA),
			readFile(pathB),
		]);
		const storage = new Uint8Array(bytesA.length + 8);
		storage.set(bytesA, 4);
		const viewA = storage.subarray(4, bytesA.length + 4);
		const expected = await diff(pathA, pathB);

		expect(await diff(viewA, bytesB)).toEqual(expected);
		expect(
			await diff(rawImage("pixelmatch/1a.png"), rawImage("pixelmatch/1b.png")),
		).toEqual(expected);
		expect(await diff(pathA, rawImage("pixelmatch/1b.png"))).toEqual(expected);
		expect(await diff(rawImage("pixelmatch/1a.png"), bytesB)).toEqual(expected);
	});

	it("returns io-error naming the missing file on either side", async () => {
		const missing = fixture("nonexistent.png");
		const existing = fixture("same/1a.png");
		for (const [a, b] of [
			[missing, existing],
			[existing, missing],
		]) {
			const result = await diff(a, b);
			expect(result).toMatchObject({ kind: "io-error", path: missing });
		}
	});

	it("returns io-error for undecodable bytes", async () => {
		const result = await diff(
			new Uint8Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
		);
		expect(result.kind).toBe("io-error");
	});

	describe("options", () => {
		const pathA = fixture("pixelmatch/1a.png");
		const pathB = fixture("pixelmatch/1b.png");
		const count = async (options: NativeDiffOptions) => {
			const result = await diff(pathA, pathB, options);
			if (result.kind !== "compared") throw new Error(result.kind);
			return result.count;
		};

		it("respects threshold", async () => {
			expect(await count({ threshold: 0.01 })).toBeGreaterThanOrEqual(
				await count({ threshold: 0.5 }),
			);
		});

		it("detects anti-aliasing by default and counts it when disabled", async () => {
			expect(await count({ antialiasing: false })).toBeGreaterThan(
				await count({}),
			);
		});

		it("reports the busiest window next to the total", async () => {
			const result = await diff(pathA, pathB, { window: 16 });
			expect(result.kind === "compared" && result.count).toBe(await count({}));
			expect(
				result.kind === "compared" && result.window?.count,
			).toBeLessThanOrEqual(256);
			expect(
				result.kind === "compared" && result.window?.count,
			).toBeGreaterThan(0);
		});

		it("skips masked pixels", async () => {
			const full = new Uint8Array(512 * 256).fill(1);
			const result = await diff(pathA, pathB, { mask: full });
			expect(result.kind === "compared" && result.identical).toBe(true);
		});

		it("draws into an Image output in place, matching the file output", async () => {
			const fromFile = await withTempDir(async (dir) => {
				const file = join(dir, "diff.png");
				await diff(pathA, pathB, { output: file });
				return new Uint8Array(PNG.sync.read(readFileSync(file)).data);
			});
			const data = new Uint8ClampedArray(512 * 256 * 4);
			await diff(pathA, pathB, { output: { data, width: 512, height: 256 } });
			expect(new Uint8Array(data.buffer)).toEqual(fromFile);
		});

		it("writes a file output only when the images differ", async () => {
			await withTempDir(async (dir) => {
				const changed = join(dir, "changed.png");
				const same = join(dir, "same.png");
				await diff(pathA, pathB, { output: { path: changed, compression: 9 } });
				await diff(pathA, pathA, { output: same });
				expect((await readFile(changed)).length).toBeGreaterThan(0);
				await expect(readFile(same)).rejects.toThrow();
			});
		});

		it("applies diffColorAlt to darkening changes", async () => {
			const outputsDiffer = await withTempDir((dir) =>
				Promise.all(
					[
						[pathA, pathB, "forward"],
						[pathB, pathA, "reverse"],
					].map(async ([base, actual, name]) => {
						const plain = join(dir, `${name}-default.png`);
						const alt = join(dir, `${name}-alt.png`);
						await diff(base, actual, { output: plain });
						await diff(base, actual, {
							output: alt,
							render: { diffColorAlt: [0, 128, 255] },
						});
						const [plainBytes, altBytes] = await Promise.all([
							readFile(plain),
							readFile(alt),
						]);
						return !plainBytes.equals(altBytes);
					}),
				),
			);
			expect(outputsDiffer.some(Boolean)).toBe(true);
		});

		it.each([
			[{ render: { diffColorAlt: [0, 256, 0] } }, "invalid-option"],
			[{ metric: "lab" }, "invalid-option"],
			[{ render: { background: "none" } }, "invalid-option"],
			[{ mask: new Uint8Array(3) }, "invalid-mask"],
			[
				{ output: { data: new Uint8Array(4), width: 1, height: 1 } },
				"invalid-output",
			],
		] as [NativeDiffOptions, string][])(
			"rejects %o with %s",
			async (options, code) => {
				const error = await diff(pathA, pathB, options).catch(
					(e: unknown) => e,
				);
				expect(error).toBeInstanceOf(BlazeDiffError);
				expect(error).toMatchObject({ code });
			},
		);

		it("rejects a raw image whose buffer does not match its size", async () => {
			const image = rawImage("pixelmatch/1a.png");
			await expect(
				diff({ ...image, data: image.data.subarray(4) }, image),
			).rejects.toMatchObject({ code: "invalid-image" });
		});
	});

	describe("CLI", () => {
		it("prints the result object as JSON and writes the output", async () => {
			await withTempDir(async (dir) => {
				const output = join(dir, "diff.png");
				const failure = await execFileAsync(getBinaryPath(), [
					fixture("pixelmatch/1a.png"),
					fixture("pixelmatch/1b.png"),
					"--output",
					output,
					"--diff-color-alt",
					"0,128,255",
					"--window",
					"16",
					"--json",
				]).catch((error: { code?: number; stdout?: string }) => error);
				expect(failure).toMatchObject({ code: 1 });
				const native = await diff(
					fixture("pixelmatch/1a.png"),
					fixture("pixelmatch/1b.png"),
					{
						window: 16,
					},
				);
				expect(JSON.parse((failure as { stdout: string }).stdout)).toEqual(
					native,
				);
				expect((await readFile(output)).length).toBeGreaterThan(0);
			});
		});

		it("exits 0 for identical images and 2 with an io-error for a missing file", async () => {
			const path = fixture("same/1a.png");
			const { stdout } = await execFileAsync(getBinaryPath(), [
				path,
				path,
				"--json",
			]);
			expect(JSON.parse(stdout)).toMatchObject({
				kind: "compared",
				identical: true,
			});

			const missing = fixture("nonexistent.png");
			const failure = await execFileAsync(getBinaryPath(), [
				path,
				missing,
				"--json",
			]).catch((error: { code?: number; stderr?: string }) => error);
			expect(failure).toMatchObject({ code: 2 });
			expect(JSON.parse((failure as { stderr: string }).stderr)).toMatchObject({
				kind: "io-error",
				path: missing,
			});
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
					await diff(path1, path2);

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
						await execFileAsync(binaryPath, [path1, path2, "--json"]);
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
