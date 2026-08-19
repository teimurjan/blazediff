import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
	compare,
	hasNativeBinding,
	hitchhikersSsim,
	metrics,
	msSsim,
	perceptualSsim,
	renderMap,
	ssim,
} from "./index";
import { decode, FIXTURES, scored } from "./test-helpers";

const A = join(FIXTURES, "1a.png");
const B = join(FIXTURES, "1b.png");
/** A different size to 1a/1b, so the pair is a layout difference. */
const OTHER = join(FIXTURES, "2b.png");

const scratch = mkdtempSync(join(tmpdir(), "blazediff-ssim-native-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("binding", () => {
	it("loads on this platform", () => {
		expect(hasNativeBinding()).toBe(true);
	});

	it("reports the metrics it accepts", () => {
		expect(metrics()).toEqual([
			"ssim",
			"ms-ssim",
			"hitchhikers-ssim",
			"perceptual-ssim",
		]);
	});
});

describe("compare", () => {
	it("calls an image identical to itself", async () => {
		const result = await compare(A, A);
		expect(result.match).toBe(true);
		expect(scored(result)).toBe(1);
	});

	it("scores a changed pair below the default floor", async () => {
		const result = await compare(A, B);
		expect(result.match).toBe(false);
		if (result.match || result.reason !== "score-below-threshold") {
			throw new Error("expected a score-below-threshold result");
		}
		expect(result.score).toBeLessThan(1);
		expect(result.belowCount).toBeGreaterThan(0);
		expect(result.belowPercentage).toBeGreaterThan(0);
		expect(result.mapWidth * result.mapHeight).toBeGreaterThan(0);
	});

	it("accepts a change under a lenient minScore", async () => {
		const result = await compare(A, B, undefined, { minScore: 0.9 });
		expect(result.match).toBe(true);
	});

	it("runs every metric over paths", async () => {
		for (const metric of metrics()) {
			const result = await compare(A, B, undefined, { metric });
			expect(scored(result), metric).toBeGreaterThan(0);
			expect(scored(result), metric).toBeLessThanOrEqual(1);
		}
	});

	it("takes encoded buffers as well as paths", async () => {
		const fromPaths = await compare(A, B, undefined, { metric: "ms-ssim" });
		const fromBuffers = await compare(
			readFileSync(A),
			readFileSync(B),
			undefined,
			{ metric: "ms-ssim" },
		);
		expect(scored(fromBuffers)).toBe(scored(fromPaths));
	});

	it("rejects mixing a path with a buffer", async () => {
		await expect(compare(A, readFileSync(B))).rejects.toThrow(TypeError);
	});

	it("reports a missing file rather than throwing", async () => {
		const result = await compare(join(FIXTURES, "does-not-exist.png"), B);
		expect(result).toEqual({
			match: false,
			reason: "file-not-exists",
			file: join(FIXTURES, "does-not-exist.png"),
		});
	});

	it("reports a size mismatch as a layout difference", async () => {
		expect(await compare(A, OTHER)).toEqual({
			match: false,
			reason: "layout-diff",
		});
	});

	it("withholds the map unless asked", async () => {
		const without = await compare(A, B);
		expect("map" in without && without.map).toBeUndefined();

		const withMap = await compare(A, B, undefined, { returnMap: true });
		if (withMap.match || withMap.reason !== "score-below-threshold") {
			throw new Error("expected a score-below-threshold result");
		}
		expect(withMap.map).toBeInstanceOf(Float32Array);
		expect(withMap.map?.length).toBe(withMap.mapWidth * withMap.mapHeight);
	});

	it("renders the score map to a file", async () => {
		const output = join(scratch, "map.png");
		await compare(A, B, output, { metric: "ssim" });
		expect(statSync(output).size).toBeGreaterThan(0);

		const { data, width, height } = decode(output);
		const source = decode(A);
		expect([width, height]).toEqual([source.width, source.height]);
		// The map is painted as opaque grayscale, dark where the score is low.
		for (let i = 0; i < data.length; i += 4) {
			expect(data[i + 3]).toBe(255);
			expect(data[i]).toBe(data[i + 1]);
			expect(data[i + 1]).toBe(data[i + 2]);
		}
	});
});

describe("options", () => {
	it("threads every shared knob through to the metric", async () => {
		const base = scored(await compare(A, B));
		for (const options of [
			{ windowSize: 7 },
			{ k1: 0.05 },
			{ k2: 0.09 },
			{ bitDepth: 16 },
		]) {
			expect(
				scored(await compare(A, B, undefined, options)),
				JSON.stringify(options),
			).not.toBe(base);
		}
	});

	it("threads the ms-ssim knobs through", async () => {
		const base = scored(await compare(A, B, undefined, { metric: "ms-ssim" }));
		const weightedSum = scored(
			await compare(A, B, undefined, {
				metric: "ms-ssim",
				msSsim: { method: "weighted-sum" },
			}),
		);
		const threeScales = scored(
			await compare(A, B, undefined, {
				metric: "ms-ssim",
				msSsim: { weights: [0.3, 0.4, 0.3] },
			}),
		);
		expect(weightedSum).not.toBe(base);
		expect(threeScales).not.toBe(base);
	});

	it("threads the hitchhikers knobs through", async () => {
		const base = scored(
			await compare(A, B, undefined, { metric: "hitchhikers-ssim" }),
		);
		expect(
			scored(
				await compare(A, B, undefined, {
					metric: "hitchhikers-ssim",
					hitchhikers: { windowStride: 4 },
				}),
			),
		).not.toBe(base);
		expect(
			scored(
				await compare(A, B, undefined, {
					metric: "hitchhikers-ssim",
					hitchhikers: { covPooling: false },
				}),
			),
		).not.toBe(base);
	});

	it("threads the perceptual knobs through", async () => {
		const base = scored(
			await compare(A, B, undefined, { metric: "perceptual-ssim" }),
		);
		expect(
			scored(
				await compare(A, B, undefined, {
					metric: "perceptual-ssim",
					perceptual: { color: "lab", chromaWeight: 0.3 },
				}),
			),
		).not.toBe(base);
		expect(
			scored(
				await compare(A, B, undefined, {
					metric: "perceptual-ssim",
					perceptual: { pooling: "mad" },
				}),
			),
		).not.toBe(base);
	});

	it("reduces perceptual-ssim to ms-ssim at its defaults", async () => {
		const perceptual = scored(
			await compare(A, B, undefined, { metric: "perceptual-ssim" }),
		);
		const multiscale = scored(
			await compare(A, B, undefined, { metric: "ms-ssim" }),
		);
		expect(perceptual).toBe(multiscale);
	});

	it("rejects options it cannot honour", async () => {
		await expect(
			compare(A, B, undefined, { metric: "nope" as never }),
		).rejects.toThrow(/Unknown metric/);
		await expect(compare(A, B, undefined, { windowSize: 0 })).rejects.toThrow(
			/windowSize must be greater than 0/,
		);
		await expect(
			compare(A, B, undefined, {
				metric: "hitchhikers-ssim",
				hitchhikers: { windowStride: 0 },
			}),
		).rejects.toThrow(/windowStride must be greater than 0/);
		await expect(
			compare(A, B, undefined, {
				metric: "ms-ssim",
				msSsim: { method: "bogus" as never },
			}),
		).rejects.toThrow(/Unknown pooling method/);
		await expect(
			compare(A, B, undefined, {
				metric: "perceptual-ssim",
				perceptual: { color: "hsv" as never },
			}),
		).rejects.toThrow(/Unknown color space/);
	});
});

describe("raw RGBA entry points", () => {
	const a = decode(A);
	const b = decode(B);

	it("match the path-based results", async () => {
		const cases = [
			["ssim", ssim],
			["ms-ssim", msSsim],
			["hitchhikers-ssim", hitchhikersSsim],
			["perceptual-ssim", perceptualSsim],
		] as const;

		for (const [metric, fn] of cases) {
			const raw = fn(a.data, b.data, a.width, a.height);
			const viaPath = await compare(A, B, undefined, { metric });
			expect(scored(raw), metric).toBe(scored(viaPath));
			if ("metric" in raw) expect(raw.metric).toBe(metric);
		}
	});

	it("rejects a buffer too short for its dimensions", () => {
		expect(() => ssim(new Uint8Array(16), new Uint8Array(16), 64, 64)).toThrow(
			/image data is 16 bytes/,
		);
	});

	it("rejects an image below ms-ssim's floor", () => {
		const small = new Uint8Array(64 * 64 * 4).fill(255);
		expect(() => msSsim(small, small, 64, 64)).toThrow(
			/too small for this metric/,
		);
	});
});

describe("renderMap", () => {
	it("paints a map into an RGBA buffer at the requested size", async () => {
		const result = await compare(A, B, undefined, {
			metric: "ms-ssim",
			returnMap: true,
		});
		if (result.match || result.reason !== "score-below-threshold") {
			throw new Error("expected a score-below-threshold result");
		}
		const map = result.map;
		if (!map) throw new Error("expected a map");

		const pixels = renderMap(map, result.mapWidth, result.mapHeight, 32, 16);
		expect(pixels.length).toBe(32 * 16 * 4);
		for (let i = 0; i < pixels.length; i += 4) {
			expect(pixels[i + 3]).toBe(255);
		}
	});
});
