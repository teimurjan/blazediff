import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { type DiffOptions, type DiffResult, diff, type Image } from "./index";
import pixelmatch from "./pixelmatch";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

const FIXTURES = [
	...[1, 2, 3, 4, 5, 6, 7].map((n) => `pixelmatch/${n}`),
	...[1, 2, 3, 4].map((n) => `blazediff/${n}`),
	"alpha/1",
];

function loadPair(name: string): { name: string; a: Image; b: Image } {
	const read = (suffix: string): Image => {
		const png = PNG.sync.read(
			readFileSync(join(FIXTURES_PATH, `${name}${suffix}.png`)),
		);
		return {
			data: new Uint8Array(png.data),
			width: png.width,
			height: png.height,
		};
	};
	return { name, a: read("a"), b: read("b") };
}

const pairs = FIXTURES.map(loadPair);

function blank({ width, height }: Image): Image {
	return { data: new Uint8Array(width * height * 4), width, height };
}

function compared(result: DiffResult) {
	if (result.kind !== "compared") throw new Error(`got ${result.kind}`);
	return result;
}

function countOf(a: Image, b: Image, options?: DiffOptions): number {
	return compared(diff(a, b, options)).count;
}

/** Deterministic noisy pair: a smooth base with sparse edits. */
function syntheticPair(width: number, height: number, seed: number) {
	let state = seed;
	const rand = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
	const a = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		a[i * 4] = (i * 7) & 0xff;
		a[i * 4 + 1] = (i * 13) & 0xff;
		a[i * 4 + 2] = (i * 3) & 0xff;
		a[i * 4 + 3] = 255;
	}
	const b = new Uint8Array(a);
	for (let i = 0; i < width * height; i++) {
		if (rand() < 0.15) {
			b[i * 4] = Math.floor(rand() * 256);
			b[i * 4 + 1] = Math.floor(rand() * 256);
		}
	}
	return { a: { data: a, width, height }, b: { data: b, width, height } };
}

/** Counted diff pixels as a 0/1 map, read back from a transparent render. */
function diffMapOf(a: Image, b: Image, options: DiffOptions): Uint8Array {
	const output = blank(a);
	diff(a, b, {
		...options,
		output,
		render: { background: "transparent" },
	});
	const map = new Uint8Array(a.width * a.height);
	for (let i = 0; i < map.length; i++) {
		const red = output.data[i * 4] === 255 && output.data[i * 4 + 1] === 0;
		map[i] = output.data[i * 4 + 3] === 255 && red ? 1 : 0;
	}
	return map;
}

/** Brute-force busiest window: first in row-major order on ties. */
function bruteWindow(
	map: Uint8Array,
	width: number,
	height: number,
	n: number,
) {
	let best = { x: 0, y: 0, count: 0 };
	for (let y = 0; y + n <= height; y++) {
		for (let x = 0; x + n <= width; x++) {
			let count = 0;
			for (let dy = 0; dy < n; dy++) {
				for (let dx = 0; dx < n; dx++) count += map[(y + dy) * width + x + dx];
			}
			if (count > best.count) best = { x, y, count };
		}
	}
	return best;
}

describe("metric: oklab", () => {
	it("agrees with the pixelmatch adapter on counts and output", () => {
		for (const { name, a, b } of pairs) {
			const output = blank(a);
			const expected = new Uint8Array(a.data.length);
			const count = compared(diff(a, b, { metric: "oklab", output })).count;
			expect(count, name).toBe(
				pixelmatch(a.data, b.data, expected, a.width, a.height),
			);
			expect(Buffer.compare(output.data as Uint8Array, expected), name).toBe(0);
		}
	});

	it("rejects unknown metrics", () => {
		const image = blank({ data: new Uint8Array(4), width: 1, height: 1 });
		expect(() =>
			diff(image, image, { metric: "lab" as DiffOptions["metric"] }),
		).toThrow('Unknown metric: lab. Expected "yiq" or "oklab".');
	});
});

describe("mask", () => {
	it("an all-zero mask keeps the default YIQ counts and output", () => {
		for (const { name, a, b } of pairs) {
			const mask = new Uint8Array(a.width * a.height);
			const variants: DiffOptions[] = [
				{},
				{ antialiasing: false },
				{ render: { background: "transparent" } },
			];
			for (const options of variants) {
				const plain = blank(a);
				const masked = blank(a);
				const plainCount = countOf(a, b, { ...options, output: plain });
				expect(countOf(a, b, { ...options, mask, output: masked }), name).toBe(
					plainCount,
				);
				expect(
					Buffer.compare(masked.data as Uint8Array, plain.data as Uint8Array),
					name,
				).toBe(0);
				expect(countOf(a, b, { ...options, mask }), name).toBe(plainCount);
			}
		}
	});

	it("skips masked pixels and draws them as unchanged", () => {
		const a: Image = {
			data: new Uint8Array(64).fill(255),
			width: 4,
			height: 4,
		};
		const b: Image = { ...a, data: new Uint8Array(a.data) };
		b.data.fill(0, 0, 8);
		const mask = new Uint8Array(16);
		mask[0] = 1;

		for (const metric of ["yiq", "oklab"] as const) {
			const output = blank(a);
			const options = { metric, antialiasing: false, mask };
			expect(countOf(a, b, { ...options, output })).toBe(1);
			expect(countOf(a, b, options)).toBe(1);
			expect(Array.from(output.data.subarray(0, 4))).toEqual([
				255, 255, 255, 255,
			]);
			expect(Array.from(output.data.subarray(4, 8))).toEqual([255, 0, 0, 255]);
		}
	});

	it("counts nothing when every pixel is masked", () => {
		const { a, b } = syntheticPair(32, 32, 7);
		const mask = new Uint8Array(32 * 32).fill(1);
		for (const metric of ["yiq", "oklab"] as const) {
			expect(compared(diff(a, b, { metric, mask })).identical).toBe(true);
		}
	});

	it("rejects a mask of the wrong size or type", () => {
		const image = blank({ data: new Uint8Array(16), width: 2, height: 2 });
		for (const mask of [new Uint8Array(3), new Uint16Array(4)]) {
			expect(() =>
				diff(image, image, { mask: mask as Uint8Array }),
			).toThrowError(
				expect.objectContaining({
					name: "BlazeDiffError",
					code: "invalid-mask",
				}),
			);
		}
	});
});

describe("window", () => {
	it("finds the busiest window and keeps the total count", () => {
		const width = 53;
		const height = 41;
		for (const seed of [11, 12]) {
			const { a, b } = syntheticPair(width, height, seed);
			for (const metric of ["yiq", "oklab"] as const) {
				const map = diffMapOf(a, b, { metric });
				const total = countOf(a, b, { metric });
				for (const n of [1, 3, 8, 16, 41]) {
					const expected = bruteWindow(map, width, height, n);
					for (const output of [undefined, blank(a)]) {
						const result = compared(diff(a, b, { metric, window: n, output }));
						expect(result.window, `${metric} n=${n}`).toEqual(expected);
						expect(result.count).toBe(total);
					}
				}
			}
		}
	});

	it("floors and clamps the side like pixelmatch", () => {
		const { a, b } = syntheticPair(40, 30, 5);
		for (const metric of ["yiq", "oklab"] as const) {
			const at = (window: number) =>
				compared(diff(a, b, { metric, window })).window;
			expect(at(0)).toEqual(at(1));
			expect(at(-5)).toEqual(at(1));
			expect(at(8.9)).toEqual(at(8));
			expect(at(1000)).toEqual(at(30));
			expect(at(Number.POSITIVE_INFINITY)).toBeUndefined();
		}
	});

	it("reports an empty window for identical images", () => {
		const { a } = syntheticPair(16, 16, 3);
		expect(compared(diff(a, a, { window: 4 })).window).toEqual({
			x: 0,
			y: 0,
			count: 0,
		});
	});
});

it("writes through a misaligned output view", () => {
	const { a, b } = pairs[0];
	const misaligned: Image = {
		...a,
		data: new Uint8Array(a.data.length + 1).subarray(1),
	};
	const aligned = blank(a);
	for (const metric of ["yiq", "oklab"] as const) {
		expect(countOf(a, b, { metric, output: misaligned })).toBe(
			countOf(a, b, { metric, output: aligned }),
		);
		expect(
			Buffer.compare(misaligned.data as Uint8Array, aligned.data as Uint8Array),
		).toBe(0);
	}
});
