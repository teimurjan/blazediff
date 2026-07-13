import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	compare as nativeCompare,
	interpret as nativeInterpret,
} from "@blazediff/core-native";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { diff, initBlazediff, interpret } from "./index";

const FIXTURES_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../../fixtures",
);

const WASM_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../wasm/blazediff_bg.wasm",
);

function loadPNG(rel: string): {
	data: Uint8Array;
	width: number;
	height: number;
} {
	const buf = readFileSync(join(FIXTURES_PATH, rel));
	const png = PNG.sync.read(buf);
	return {
		data: new Uint8Array(png.data),
		width: png.width,
		height: png.height,
	};
}

function solidRgba(width: number, height: number, value: number): Uint8Array {
	const pixels = new Uint8Array(width * height * 4);
	for (let offset = 0; offset < pixels.length; offset += 4) {
		pixels.set([value, value, value, 255], offset);
	}
	return pixels;
}

beforeAll(async () => {
	const bytes = readFileSync(WASM_PATH);
	await initBlazediff(bytes);
});

describe("diff() parity with @blazediff/core-native (same Rust algorithm)", () => {
	const cases = [
		"pixelmatch/1",
		"pixelmatch/2",
		"pixelmatch/3",
		"pixelmatch/4",
	];

	for (const c of cases) {
		it(`${c}a.png vs ${c}b.png matches native exactly`, async () => {
			const a = loadPNG(`${c}a.png`);
			const b = loadPNG(`${c}b.png`);

			// Match settings on both sides:
			//   wasm includeAA=true  ↔  native antialiasing=false (count AA)
			const wasmCount = await diff(
				a.data,
				b.data,
				a.width,
				a.height,
				undefined,
				{
					includeAA: true,
				},
			);

			const nativeResult = await nativeCompare(
				join(FIXTURES_PATH, `${c}a.png`),
				join(FIXTURES_PATH, `${c}b.png`),
				undefined,
				{ antialiasing: false },
			);
			const nativeCount =
				nativeResult.match || !("diffCount" in nativeResult)
					? 0
					: (nativeResult.diffCount ?? 0);

			expect(wasmCount).toBe(nativeCount);
			expect(wasmCount).toBeGreaterThan(0);
		});
	}
});

describe("diff() smoke", () => {
	it("returns 0 for identical buffers", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const count = await diff(a.data, a.data, a.width, a.height);
		expect(count).toBe(0);
	});

	it("writes diff visualization into output buffer", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		const out = new Uint8Array(a.width * a.height * 4);
		const count = await diff(a.data, b.data, a.width, a.height, out);
		expect(count).toBeGreaterThan(0);
		expect(out.some((v) => v !== 0)).toBe(true);
	});

	it("writes diffColorAlt for darkening changes", async () => {
		const brighter = solidRgba(2, 2, 200);
		const darker = solidRgba(2, 2, 50);
		const out = new Uint8Array(brighter.length);

		const count = await diff(brighter, darker, 2, 2, out, {
			includeAA: true,
			diffColorAlt: [0, 128, 255],
		});

		expect(count).toBe(4);
		expect([...out.slice(0, 4)]).toEqual([0, 128, 255, 255]);
	});

	it("rejects invalid diffColorAlt channels", async () => {
		const brighter = solidRgba(2, 2, 200);
		const darker = solidRgba(2, 2, 50);

		await expect(
			diff(brighter, darker, 2, 2, undefined, {
				diffColorAlt: [0, 256, 0],
			}),
		).rejects.toThrow("diffColorAlt must contain three integer RGB channels");
	});

	it("rejects mismatched buffer size", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const short = new Uint8Array(4);
		await expect(diff(short, a.data, a.width, a.height)).rejects.toThrow();
	});
});

describe("diff() with interpretation", () => {
	it("writes the same diff while returning interpretation", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		const standalone = new Uint8Array(a.data.length);
		const combined = new Uint8Array(a.data.length);
		const options = {
			includeAA: true,
			diffColorAlt: [0, 128, 255] as [number, number, number],
		};
		const diffCount = await diff(
			a.data,
			b.data,
			a.width,
			a.height,
			standalone,
			options,
		);

		const result = await diff(a.data, b.data, a.width, a.height, combined, {
			...options,
			interpret: true,
		});

		expect(result.match).toBe(false);
		if (!result.match) {
			expect(result.diffCount).toBe(diffCount);
			expect(result.interpretation.diffCount).toBe(diffCount);
		}
		expect(combined).toEqual(standalone);
	});

	it("preserves output for identical buffers", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const out = new Uint8Array(a.data.length).fill(17);

		const result = await diff(a.data, a.data, a.width, a.height, out, {
			interpret: true,
		});

		expect(result.match).toBe(true);
		expect(result.interpretation.totalRegions).toBe(0);
		expect(out.every((value) => value === 17)).toBe(true);
	});
});

describe("interpret() parity with @blazediff/core-native (same Rust algorithm)", () => {
	const cases = ["pixelmatch/1", "pixelmatch/2", "pixelmatch/3"];

	for (const c of cases) {
		it(`${c}a.png vs ${c}b.png matches native`, async () => {
			const a = loadPNG(`${c}a.png`);
			const b = loadPNG(`${c}b.png`);

			// Match AA handling on both sides:
			//   wasm includeAA=true  ↔  native antialiasing=false (count AA)
			const wasmResult = await interpret(a.data, b.data, a.width, a.height, {
				includeAA: true,
			});
			const nativeResult = await nativeInterpret(
				join(FIXTURES_PATH, `${c}a.png`),
				join(FIXTURES_PATH, `${c}b.png`),
				{ antialiasing: false },
			);

			expect(wasmResult.totalRegions).toBe(nativeResult.totalRegions);
			expect(wasmResult.diffCount).toBe(nativeResult.diffCount);
			// Region order isn't a contract (native processes regions in
			// parallel), so compare the set of change types, not their order.
			const sorted = (r: typeof wasmResult) =>
				r.regions.map((x) => x.changeType).sort();
			expect(sorted(wasmResult)).toEqual(sorted(nativeResult));
		});
	}
});

describe("interpret() smoke", () => {
	it("finds change regions on differing images", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		const result = await interpret(a.data, b.data, a.width, a.height);
		expect(result.totalRegions).toBeGreaterThan(0);
		expect(result.regions.length).toBe(result.totalRegions);
		expect(typeof result.summary).toBe("string");
	});

	it("reports no regions for identical buffers", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const result = await interpret(a.data, a.data, a.width, a.height);
		expect(result.totalRegions).toBe(0);
		expect(result.regions).toHaveLength(0);
	});

	it("rejects mismatched buffer size", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const short = new Uint8Array(4);
		await expect(interpret(short, a.data, a.width, a.height)).rejects.toThrow();
	});
});
