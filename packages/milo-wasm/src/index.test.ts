import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compare as nativeCompare } from "@blazediff/milo-native";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { initMilo, milo } from "./index";

const FIXTURES_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../../fixtures",
);

const WASM_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../wasm/blazediff_milo_bg.wasm",
);

function loadPNG(rel: string): {
	data: Uint8Array;
	width: number;
	height: number;
} {
	const png = PNG.sync.read(readFileSync(join(FIXTURES_PATH, rel)));
	return {
		data: new Uint8Array(png.data),
		width: png.width,
		height: png.height,
	};
}

beforeAll(async () => {
	// Node has no fetch-from-module-URL for the sibling .wasm, so hand the
	// bytes over directly.
	await initMilo(readFileSync(WASM_PATH));
});

describe("milo", () => {
	// The whole point of the package: the browser build must agree with the
	// N-API build, because they are the same Rust metric. The wasm build has
	// no fused multiply-add, so agreement is to summation-order noise rather
	// than bit-exact.
	const pairs = [
		["blazediff/1a.png", "blazediff/1b.png"],
		["blazediff/2a.png", "blazediff/2b.png"],
		["alpha/1a.png", "alpha/1b.png"],
		["pixelmatch/4a.png", "pixelmatch/4b.png"],
	];

	it.each(pairs)(
		"matches milo-native on %s",
		async (relA, relB) => {
			const a = loadPNG(relA);
			const b = loadPNG(relB);

			const actual = await milo(a.data, b.data, a.width, a.height);
			const expected = await nativeCompare(
				join(FIXTURES_PATH, relA),
				join(FIXTURES_PATH, relB),
			);
			if (!("rawError" in expected)) throw new Error("native did not score");

			expect(actual.width).toBe(a.width);
			expect(actual.height).toBe(a.height);
			expect(actual.rawError).toBeCloseTo(expected.rawError, 7);
			expect(actual.mos).toBeCloseTo(expected.mos, 4);
		},
		60_000,
	);

	it("scores an identical pair zero", async () => {
		const a = loadPNG("alpha/1a.png");
		const result = await milo(a.data, a.data, a.width, a.height);
		expect(result.rawError).toBe(0);
		expect(result.mos).toBeCloseTo(4.346, 2);
		expect(result.mask).toBeUndefined();
		expect(result.errorMap).toBeUndefined();
	});

	it("returns the maps on request", async () => {
		const a = loadPNG("pixelmatch/4a.png");
		const b = loadPNG("pixelmatch/4b.png");
		const result = await milo(a.data, b.data, a.width, a.height, {
			returnMaps: true,
		});
		expect(result.mask?.length).toBe(a.width * a.height);
		expect(result.errorMap?.length).toBe(a.width * a.height);
		expect(result.errorMap?.some((v) => v > 0)).toBe(true);
	});

	it("rejects a buffer whose length is not width*height*4", async () => {
		await expect(
			milo(new Uint8Array(4), new Uint8Array(4), 16, 16),
		).rejects.toThrow(/expected 1024 bytes/);
	});

	it("rejects images below the 16px floor", async () => {
		const side = 15;
		const rgba = new Uint8Array(side * side * 4).fill(200);
		await expect(milo(rgba, rgba, side, side)).rejects.toThrow(/too small/);
	});
});
