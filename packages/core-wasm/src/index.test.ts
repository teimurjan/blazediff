import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	BlazeDiffError,
	diff as coreDiff,
	type DiffOptions,
} from "@blazediff/core";
import { diff as nativeDiff } from "@blazediff/core-native";
import { PNG } from "pngjs";
import { beforeAll, describe, expect, it } from "vitest";
import { diff, initBlazediff } from "./index";

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

function solid(width: number, height: number, value: number) {
	const data = new Uint8Array(width * height * 4);
	for (let offset = 0; offset < data.length; offset += 4) {
		data.set([value, value, value, 255], offset);
	}
	return { data, width, height };
}

beforeAll(async () => {
	const bytes = readFileSync(WASM_PATH);
	await initBlazediff(bytes);
});

describe("diff() parity with @blazediff/core-native (same Rust algorithm)", () => {
	it.each(["pixelmatch/1", "pixelmatch/2", "pixelmatch/3", "pixelmatch/4"])(
		"%s matches native with default options and with AA counted",
		async (name) => {
			const a = loadPNG(`${name}a.png`);
			const b = loadPNG(`${name}b.png`);
			for (const options of [{}, { antialiasing: false }]) {
				const wasm = await diff(a, b, options);
				const native = await nativeDiff(
					join(FIXTURES_PATH, `${name}a.png`),
					join(FIXTURES_PATH, `${name}b.png`),
					options,
				);
				expect(wasm).toEqual(native);
				expect(wasm.kind === "compared" && wasm.count).toBeGreaterThan(0);
			}
		},
	);
});

describe("diff() smoke", () => {
	it("reports identical buffers", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		expect(await diff(a, a)).toEqual({
			kind: "compared",
			count: 0,
			percentage: 0,
			identical: true,
		});
	});

	it("writes the diff into output, including a Uint8ClampedArray", async () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		const data = new Uint8ClampedArray(a.width * a.height * 4);
		const result = await diff(a, b, {
			output: { data, width: a.width, height: a.height },
		});
		expect(result.kind === "compared" && result.count).toBeGreaterThan(0);
		expect(data.some((v) => v !== 0)).toBe(true);
	});

	it("writes diffColorAlt for darkening changes", async () => {
		const out = solid(2, 2, 0);
		const result = await diff(solid(2, 2, 200), solid(2, 2, 50), {
			antialiasing: false,
			output: out,
			render: { diffColorAlt: [0, 128, 255] },
		});
		expect(result.kind === "compared" && result.count).toBe(4);
		expect([...out.data.slice(0, 4)]).toEqual([0, 128, 255, 255]);
	});

	it("returns a dimension mismatch instead of throwing", async () => {
		expect(await diff(solid(2, 2, 0), solid(3, 1, 0))).toEqual({
			kind: "dimension-mismatch",
			a: { width: 2, height: 2 },
			b: { width: 3, height: 1 },
		});
	});

	it.each([
		[{ render: { diffColorAlt: [0, 256, 0] } }, "invalid-option"],
		[{ metric: "lab" }, "invalid-option"],
		[{ render: { background: "none" } }, "invalid-option"],
		[{ mask: new Uint8Array(3) }, "invalid-mask"],
		[{ output: solid(1, 1, 0) }, "invalid-output"],
	] as [DiffOptions, string][])("rejects %o with %s", async (options, code) => {
		const pixels = solid(2, 2, 0);
		await expect(diff(pixels, pixels, options)).rejects.toMatchObject({
			name: "BlazeDiffError",
			code,
		});
	});

	it("rejects a buffer shorter than its size", async () => {
		const a = solid(2, 2, 0);
		await expect(
			diff({ ...a, data: new Uint8Array(4) }, a),
		).rejects.toBeInstanceOf(BlazeDiffError);
	});
});

it("fills the output of an identical pair like @blazediff/core", async () => {
	const a = loadPNG("pixelmatch/1a.png");
	const copy = { ...a, data: new Uint8Array(a.data) };
	for (const background of ["faded", "transparent"] as const) {
		const wasmOut = { ...a, data: new Uint8Array(a.data.length).fill(7) };
		const coreOut = { ...a, data: new Uint8Array(a.data.length).fill(7) };
		await diff(a, copy, { output: wasmOut, render: { background } });
		coreDiff(a, copy, { output: coreOut, render: { background } });
		expect(Buffer.compare(wasmOut.data, coreOut.data), background).toBe(0);
	}
});

describe("diff() metric, mask and window match @blazediff/core", () => {
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
		const mask = new Uint8Array(a.width * a.height);
		for (let i = 0; i < mask.length; i += 7) mask[i] = 1;
		// YIQ cases count AA pixels: the YIQ AA detectors visit neighbours in a
		// different order in JS and Rust. OKLab uses pixelmatch's order in both.
		const cases: DiffOptions[] = [
			{ metric: "oklab" },
			{ metric: "oklab", antialiasing: false, threshold: 0.05 },
			{ metric: "oklab", mask, window: 16 },
			{ metric: "yiq", antialiasing: false, mask },
			{ metric: "yiq", antialiasing: false, window: 8 },
		];
		for (const options of cases) {
			expect(await diff(a, b, options)).toEqual(coreDiff(a, b, options));
		}
	});
});
