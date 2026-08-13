import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	hasNativeBinding,
	interpret,
	interpretRegions,
	type RegionSource,
} from "./index";

const FIXTURES = join(__dirname, "../../../fixtures/blazediff");
const A = join(FIXTURES, "1a.png");
const B = join(FIXTURES, "1b.png");
/** A different size to 1a/1b. */
const OTHER = join(FIXTURES, "2b.png");

const scratch = mkdtempSync(join(tmpdir(), "blazediff-interpret-native-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const METRIC_SOURCES: RegionSource[] = ["ssim", "ms-ssim", "hitchhikers-ssim"];

describe("binding", () => {
	it("loads on this platform", () => {
		expect(hasNativeBinding()).toBe(true);
	});
});

describe("interpret", () => {
	it("describes a pixel diff by default", async () => {
		const result = await interpret(A, B);
		expect(result.totalRegions).toBeGreaterThan(0);
		expect(result.diffCount).toBeGreaterThan(0);
		expect(result.summary).toBeTruthy();
		expect(result.severity).toBeTruthy();

		const [region] = result.regions;
		expect(region.changeType).toBeTruthy();
		expect(region.position).toBeTruthy();
		expect(region.pixelCount).toBeGreaterThan(0);
	});

	it("calls an image identical to itself", async () => {
		const result = await interpret(A, A);
		expect(result.summary).toBe("Images are identical");
		expect(result.totalRegions).toBe(0);
		expect(result.diffCount).toBe(0);
	});

	it("locates regions with each metric source", async () => {
		for (const source of METRIC_SOURCES) {
			const result = await interpret(A, B, undefined, { source });
			expect(result.totalRegions, source).toBeGreaterThan(0);
			expect(result.diffCount, source).toBeGreaterThan(0);
		}
	});

	/**
	 * The metric grid is far coarser than a pixel, yet the count it reports is
	 * of actual pixels — that is what refinement buys, and it should land near
	 * what the exact pixel diff sees.
	 */
	it("counts pixels, not map windows", async () => {
		const pixel = await interpret(A, B);
		const metric = await interpret(A, B, undefined, { source: "ms-ssim" });

		expect(metric.diffCount).toBeGreaterThan(0);
		const ratio = metric.diffCount / pixel.diffCount;
		expect(ratio).toBeGreaterThan(0.5);
		expect(ratio).toBeLessThan(2);
	});

	it("takes encoded buffers on the pixel source", async () => {
		const fromPaths = await interpret(A, B);
		const fromBuffers = await interpret(readFileSync(A), readFileSync(B));
		expect(fromBuffers.diffCount).toBe(fromPaths.diffCount);
	});

	it("rejects buffers on a metric source", async () => {
		await expect(
			interpret(readFileSync(A), readFileSync(B), undefined, {
				source: "ms-ssim",
			}),
		).rejects.toThrow(/require file paths/);
	});

	it("rejects mixing a path with a buffer", async () => {
		await expect(interpret(A, readFileSync(B))).rejects.toThrow(TypeError);
	});

	it("writes the diff visualization when asked", async () => {
		const output = join(scratch, "diff.png");
		await interpret(A, B, output);
		expect(statSync(output).size).toBeGreaterThan(0);
	});

	it("threads the pixel knobs through", async () => {
		const base = await interpret(A, B);
		const strict = await interpret(A, B, undefined, { threshold: 0.02 });
		expect(strict.diffCount).not.toBe(base.diffCount);
	});

	it("threads the metric knobs through", async () => {
		const base = await interpret(A, B, undefined, { source: "ms-ssim" });
		const loose = await interpret(A, B, undefined, {
			source: "ms-ssim",
			regionFloor: 0.5,
		});
		expect(loose.totalRegions).toBeLessThanOrEqual(base.totalRegions);
	});

	it("rejects an unknown source", async () => {
		await expect(
			interpret(A, B, undefined, { source: "nope" as RegionSource }),
		).rejects.toThrow(/Unknown metric/);
	});

	it("rejects a size mismatch", async () => {
		await expect(interpret(A, OTHER)).rejects.toThrow(
			/Image sizes do not match/,
		);
	});

	it("reports a missing file", async () => {
		await expect(interpret(join(FIXTURES, "nope.png"), B)).rejects.toThrow(
			/Failed to load images/,
		);
	});
});

describe("interpretRegions", () => {
	it("classifies a caller-supplied region", async () => {
		const result = await interpretRegions(A, B, [
			{ x: 900, y: 40, width: 240, height: 250 },
		]);
		expect(result.totalRegions).toBe(1);
		expect(result.diffCount).toBeGreaterThan(0);
		expect(result.regions[0].changeType).toBeTruthy();
	});

	it("treats no regions as identical", async () => {
		const result = await interpretRegions(A, B, []);
		expect(result.totalRegions).toBe(0);
		expect(result.diffCount).toBe(0);
	});

	it("rejects a region outside the image rather than reading past it", async () => {
		await expect(
			interpretRegions(A, B, [{ x: 900, y: 40, width: 240, height: 260 }]),
		).rejects.toThrow(/falls outside/);
	});
});
