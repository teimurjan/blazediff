import { readFileSync } from "node:fs";
import { join } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { type CoreOptions, diff } from "./index";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

// Small and transparent fixtures; 4k/page pairs are covered by the parity
// scripts and would make this suite take minutes.
const FIXTURES = [
	...[1, 2, 3, 4, 5, 6, 7].map((n) => `pixelmatch/${n}`),
	...[1, 2, 3, 4].map((n) => `blazediff/${n}`),
	"alpha/1",
];

interface Pair {
	name: string;
	a: Uint8Array;
	b: Uint8Array;
	width: number;
	height: number;
}

function loadPair(name: string): Pair {
	const a = PNG.sync.read(readFileSync(join(FIXTURES_PATH, `${name}a.png`)));
	const b = PNG.sync.read(readFileSync(join(FIXTURES_PATH, `${name}b.png`)));
	return {
		name,
		a: new Uint8Array(a.data),
		b: new Uint8Array(b.data),
		width: a.width,
		height: a.height,
	};
}

const pairs = FIXTURES.map(loadPair);

/** Every 7th pixel ignored: dense enough to hit diffs, sparse enough to leave some. */
function stripeMask(width: number, height: number): Uint8Array {
	const mask = new Uint8Array(width * height);
	for (let i = 0; i < mask.length; i += 7) mask[i] = 1;
	return mask;
}

/** Deterministic noisy pair: a smooth base with sparse and dense edits. */
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
	return { a, b };
}

/** Brute-force N×N maximum over a 0/1 diff map. */
function bruteWindowMax(
	map: Uint8Array,
	width: number,
	height: number,
	n: number,
): number {
	let best = 0;
	for (let y = 0; y + n <= height; y++) {
		for (let x = 0; x + n <= width; x++) {
			let count = 0;
			for (let dy = 0; dy < n; dy++) {
				for (let dx = 0; dx < n; dx++) count += map[(y + dy) * width + x + dx];
			}
			if (count > best) best = count;
		}
	}
	return best;
}

/** Counted diff pixels as a 0/1 map, read back from a diffMask output. */
function diffMapOf(
	a: Uint8Array,
	b: Uint8Array,
	width: number,
	height: number,
	options: CoreOptions,
): Uint8Array {
	const output = new Uint8Array(width * height * 4);
	diff(a, b, output, width, height, {
		...options,
		diffMask: true,
		diffColor: [255, 0, 0],
		diffColorAlt: [255, 0, 0],
	});
	const map = new Uint8Array(width * height);
	for (let i = 0; i < map.length; i++)
		map[i] = output[i * 4 + 3] === 255 ? 1 : 0;
	return map;
}

describe("colorSpace: oklab matches pixelmatch 8", () => {
	const cases: Array<[string, (pair: Pair) => CoreOptions]> = [
		["defaults", () => ({})],
		["includeAA", () => ({ includeAA: true })],
		["threshold 0.05", () => ({ threshold: 0.05 })],
		["threshold 0.3", () => ({ threshold: 0.3 })],
		["diffColorAlt", () => ({ diffColorAlt: [0, 255, 0] })],
		["diffMask", () => ({ diffMask: true })],
		["windowSize 16", () => ({ windowSize: 16 })],
		["ignoreMask", (p) => ({ ignoreMask: stripeMask(p.width, p.height) })],
		[
			"ignoreMask + windowSize + includeAA",
			(p) => ({
				ignoreMask: stripeMask(p.width, p.height),
				windowSize: 8,
				includeAA: true,
			}),
		],
	];

	for (const [label, makeOptions] of cases) {
		it(`${label}: counts and output bytes`, () => {
			for (const pair of pairs) {
				const { a, b, width, height } = pair;
				const options = makeOptions(pair);
				const expected = new Uint8Array(width * height * 4);
				const actual = new Uint8Array(width * height * 4);
				const expectedCount = pixelmatch(
					a,
					b,
					expected,
					width,
					height,
					options,
				);

				expect(
					diff(a, b, actual, width, height, {
						...options,
						colorSpace: "oklab",
					}),
					pair.name,
				).toBe(expectedCount);
				expect(Buffer.compare(actual, expected), pair.name).toBe(0);
				expect(
					diff(a, b, undefined, width, height, {
						...options,
						colorSpace: "oklab",
					}),
					pair.name,
				).toBe(pixelmatch(a, b, undefined, width, height, options));
			}
		});
	}

	it("matches on dense synthetic noise", () => {
		const width = 97;
		const height = 61;
		for (const seed of [1, 2, 3]) {
			const { a, b } = syntheticPair(width, height, seed);
			for (const options of [{}, { includeAA: true }, { threshold: 0.02 }]) {
				expect(
					diff(a, b, undefined, width, height, {
						...options,
						colorSpace: "oklab",
					}),
				).toBe(pixelmatch(a, b, undefined, width, height, options));
			}
		}
	});
});

describe("extended path keeps YIQ results", () => {
	it("an all-zero ignoreMask changes neither counts nor output", () => {
		for (const pair of pairs) {
			const { a, b, width, height } = pair;
			const mask = new Uint8Array(width * height);
			for (const options of [{}, { includeAA: true }, { diffMask: true }]) {
				const plain = new Uint8Array(width * height * 4);
				const masked = new Uint8Array(width * height * 4);
				const plainCount = diff(a, b, plain, width, height, options);
				expect(
					diff(a, b, masked, width, height, { ...options, ignoreMask: mask }),
					pair.name,
				).toBe(plainCount);
				expect(Buffer.compare(masked, plain), pair.name).toBe(0);
				expect(
					diff(a, b, undefined, width, height, {
						...options,
						ignoreMask: mask,
					}),
					pair.name,
				).toBe(plainCount);
			}
		}
	});

	it("a window covering the whole image returns the total count", () => {
		for (const pair of pairs) {
			const { a, b, width, height } = pair;
			if (width !== height) continue;
			for (const colorSpace of ["yiq", "oklab"] as const) {
				expect(
					diff(a, b, undefined, width, height, {
						colorSpace,
						windowSize: width,
					}),
					pair.name,
				).toBe(diff(a, b, undefined, width, height, { colorSpace }));
			}
		}
	});
});

describe("ignoreMask", () => {
	it("skips masked pixels and draws them as unchanged", () => {
		const width = 4;
		const height = 4;
		const a = new Uint8Array(width * height * 4).fill(255);
		const b = new Uint8Array(a);
		b.fill(0, 0, 8); // pixels 0 and 1 turn black
		const mask = new Uint8Array(width * height);
		mask[0] = 1;

		for (const colorSpace of ["yiq", "oklab"] as const) {
			const output = new Uint8Array(width * height * 4);
			const options = { colorSpace, includeAA: true, ignoreMask: mask };
			expect(diff(a, b, output, width, height, options)).toBe(1);
			expect(diff(a, b, undefined, width, height, options)).toBe(1);
			expect(Array.from(output.subarray(0, 4))).toEqual([255, 255, 255, 255]);
			expect(Array.from(output.subarray(4, 8))).toEqual([255, 0, 0, 255]);
		}
	});

	it("returns 0 when every pixel is masked", () => {
		const { a, b } = syntheticPair(32, 32, 7);
		const mask = new Uint8Array(32 * 32).fill(1);
		for (const colorSpace of ["yiq", "oklab"] as const) {
			expect(
				diff(a, b, undefined, 32, 32, { colorSpace, ignoreMask: mask }),
			).toBe(0);
		}
	});

	it("rejects a mask of the wrong size or type", () => {
		const a = new Uint8Array(16);
		expect(() =>
			diff(a, a, undefined, 2, 2, { ignoreMask: new Uint8Array(3) }),
		).toThrow("Ignore mask size does not match image width/height");
		expect(() =>
			diff(a, a, undefined, 2, 2, {
				ignoreMask: new Uint16Array(4) as unknown as Uint8Array,
			}),
		).toThrow("Image data: Uint8Array, Uint8ClampedArray or Buffer expected.");
	});
});

describe("windowSize", () => {
	it("matches a brute-force window maximum", () => {
		const width = 53;
		const height = 41;
		for (const seed of [11, 12]) {
			const { a, b } = syntheticPair(width, height, seed);
			for (const colorSpace of ["yiq", "oklab"] as const) {
				const map = diffMapOf(a, b, width, height, { colorSpace });
				for (const n of [1, 3, 8, 16, 41]) {
					const expected = bruteWindowMax(map, width, height, n);
					const options = { colorSpace, windowSize: n };
					expect(diff(a, b, undefined, width, height, options)).toBe(expected);
					expect(
						diff(
							a,
							b,
							new Uint8Array(width * height * 4),
							width,
							height,
							options,
						),
					).toBe(expected);
				}
			}
		}
	});

	it("floors and clamps the window side like pixelmatch", () => {
		const { a, b } = syntheticPair(40, 30, 5);
		for (const colorSpace of ["yiq", "oklab"] as const) {
			const at = (windowSize: number) =>
				diff(a, b, undefined, 40, 30, { colorSpace, windowSize });
			expect(at(0)).toBe(at(1));
			expect(at(-5)).toBe(at(1));
			expect(at(8.9)).toBe(at(8));
			expect(at(1000)).toBe(at(30));
			expect(at(Number.POSITIVE_INFINITY)).toBe(
				diff(a, b, undefined, 40, 30, { colorSpace }),
			);
		}
	});

	it("is 0 for identical images", () => {
		const { a } = syntheticPair(16, 16, 3);
		expect(diff(a, a, undefined, 16, 16, { windowSize: 4 })).toBe(0);
	});
});

describe("colorSpace", () => {
	it("rejects unknown values", () => {
		const a = new Uint8Array(4);
		expect(() =>
			diff(a, a, undefined, 1, 1, {
				colorSpace: "lab" as CoreOptions["colorSpace"],
			}),
		).toThrow('Unknown colorSpace: lab. Expected "yiq" or "oklab".');
	});

	it("writes through a misaligned output view", () => {
		const { a, b, width, height } = pairs[0];
		const backing = new Uint8Array(width * height * 4 + 1);
		const misaligned = backing.subarray(1);
		const aligned = new Uint8Array(width * height * 4);
		const options = { colorSpace: "oklab" as const };
		expect(diff(a, b, misaligned, width, height, options)).toBe(
			diff(a, b, aligned, width, height, options),
		);
		expect(Buffer.compare(misaligned, aligned)).toBe(0);
	});
});
