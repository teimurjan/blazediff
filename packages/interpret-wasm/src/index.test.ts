import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { interpret as nativeInterpret } from "@blazediff/interpret-native";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { initInterpret, interpret } from "./index";

const FIXTURES_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../../../fixtures",
);

const WASM_PATH = join(
	fileURLToPath(new URL(".", import.meta.url)),
	"../wasm/blazediff_interpret_bg.wasm",
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
	await initInterpret(readFileSync(WASM_PATH));
});

describe("interpret", () => {
	// The whole point of the package: the browser build must agree with the
	// N-API build, because they are the same Rust classifier.
	const pairs = [
		["blazediff/1a.png", "blazediff/1b.png"],
		["blazediff/2a.png", "blazediff/2b.png"],
		["blazediff/3a.png", "blazediff/3b.png"],
		["blazediff/4a.png", "blazediff/4b.png"],
		["pixelmatch/1a.png", "pixelmatch/1b.png"],
		["alpha/1a.png", "alpha/1b.png"],
	];

	it.each(pairs)("matches interpret-native on %s", async (relA, relB) => {
		const a = loadPNG(relA);
		const b = loadPNG(relB);

		const actual = await interpret(a.data, b.data, a.width, a.height);
		const expected = await nativeInterpret(
			join(FIXTURES_PATH, relA),
			join(FIXTURES_PATH, relB),
		);

		expect(actual.summary).toBe(expected.summary);
		expect(actual.severity).toBe(expected.severity);
		expect(actual.diffCount).toBe(expected.diffCount);
		expect(actual.totalRegions).toBe(expected.totalRegions);
		expect(actual.width).toBe(expected.width);
		expect(actual.height).toBe(expected.height);
		expect(actual.diffPercentage).toBeCloseTo(expected.diffPercentage, 10);

		expect(
			actual.regions.map((r) => [r.bbox, r.changeType, r.position]),
		).toEqual(expected.regions.map((r) => [r.bbox, r.changeType, r.position]));
	});

	it("reports no regions for an identical pair", async () => {
		const a = loadPNG("blazediff/3a.png");

		const result = await interpret(a.data, a.data, a.width, a.height);

		expect(result.totalRegions).toBe(0);
		expect(result.regions).toEqual([]);
		expect(result.diffCount).toBe(0);
	});

	it("writes the visualization into a provided output buffer", async () => {
		const a = loadPNG("blazediff/1a.png");
		const b = loadPNG("blazediff/1b.png");
		const output = new Uint8Array(a.width * a.height * 4);

		const result = await interpret(a.data, b.data, a.width, a.height, output);

		expect(result.diffCount).toBeGreaterThan(0);
		expect(output.some((byte) => byte !== 0)).toBe(true);
	});

	it("rejects a buffer whose length is not width*height*4", async () => {
		await expect(
			interpret(new Uint8Array(4), new Uint8Array(4), 2, 2),
		).rejects.toThrow(/expected 16 bytes/);
	});

	it("rejects an output buffer of the wrong length", async () => {
		const a = loadPNG("alpha/1a.png");
		const b = loadPNG("alpha/1b.png");

		await expect(
			interpret(a.data, b.data, a.width, a.height, new Uint8Array(8)),
		).rejects.toThrow(/out_diff/);
	});
});
