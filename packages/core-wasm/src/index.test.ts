import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { diff as coreDiff } from "@blazediff/core";
import { compare as nativeCompare } from "@blazediff/core-native";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { type DiffOptions, diff, initBlazediff } from "./index";

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

/** Artifacts built before `colorSpace` existed drop the extra arguments instead of rejecting them. */
async function supportsExtendedOptions(): Promise<boolean> {
	await initBlazediff(readFileSync(WASM_PATH));
	const pixel = solidRgba(1, 1, 0);
	try {
		await diff(pixel, pixel, 1, 1, undefined, {
			colorSpace: "unknown" as "oklab",
		});
		return false;
	} catch {
		return true;
	}
}

describe.skipIf(!(await supportsExtendedOptions()))(
	"diff() colorSpace, ignoreMask and windowSize match @blazediff/core",
	() => {
		it.each([
			"pixelmatch/1",
			"pixelmatch/2",
			"pixelmatch/5",
			"pixelmatch/7",
			"blazediff/3",
			"alpha/1",
		])("%s", async (name) => {
			const a = loadPNG(`${name}a.png`);
			const b = loadPNG(`${name}b.png`);
			const stripe = new Uint8Array(a.width * a.height);
			for (let i = 0; i < stripe.length; i += 7) stripe[i] = 1;
			const cases: DiffOptions[] = [
				{ colorSpace: "oklab" },
				{ colorSpace: "oklab", includeAA: true, threshold: 0.05 },
				{ colorSpace: "oklab", ignoreMask: stripe, windowSize: 16 },
				{ colorSpace: "yiq", includeAA: true, ignoreMask: stripe },
				{ colorSpace: "yiq", includeAA: true, windowSize: 8 },
			];
			for (const options of cases) {
				const expected = coreDiff(
					a.data,
					b.data,
					undefined,
					a.width,
					a.height,
					options,
				);
				expect(
					await diff(a.data, b.data, a.width, a.height, undefined, options),
				).toBe(expected);
			}
		});

		it("rejects an unknown colorSpace and a short mask", async () => {
			const pixels = solidRgba(2, 2, 0);
			await expect(
				diff(pixels, pixels, 2, 2, undefined, {
					colorSpace: "lab" as "oklab",
				}),
			).rejects.toThrow('Unknown color space: lab. Expected "yiq" or "oklab".');
			await expect(
				diff(pixels, pixels, 2, 2, undefined, {
					ignoreMask: new Uint8Array(3),
				}),
			).rejects.toThrow("Invalid ignore mask size: expected 4, got 3");
		});
	},
);
