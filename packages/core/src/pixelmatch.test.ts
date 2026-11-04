import { readFileSync } from "node:fs";
import { join } from "node:path";
import upstream from "pixelmatch";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import pixelmatch, { type PixelmatchOptions } from "./pixelmatch";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

// Small and transparent fixtures; 4k/page pairs would make this suite take minutes.
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
	return { a, b };
}

describe("@blazediff/core/pixelmatch matches pixelmatch 8.0.0", () => {
	const cases: Array<[string, (pair: Pair) => PixelmatchOptions]> = [
		["defaults", () => ({})],
		["includeAA", () => ({ includeAA: true })],
		["threshold 0.05", () => ({ threshold: 0.05 })],
		["threshold 0.3", () => ({ threshold: 0.3 })],
		["diffColorAlt", () => ({ diffColorAlt: [0, 255, 0] })],
		["diffMask", () => ({ diffMask: true })],
		["checkerboard off", () => ({ checkerboard: false })],
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
				const expectedCount = upstream(a, b, expected, width, height, options);

				expect(
					pixelmatch(a, b, actual, width, height, options),
					pair.name,
				).toBe(expectedCount);
				expect(Buffer.compare(actual, expected), pair.name).toBe(0);
				expect(pixelmatch(a, b, null, width, height, options), pair.name).toBe(
					upstream(a, b, null, width, height, options),
				);
			}
		});
	}

	it("matches on dense synthetic noise", () => {
		const width = 97;
		const height = 61;
		for (const seed of [1, 2, 3]) {
			const { a, b } = syntheticPair(width, height, seed);
			for (const options of [{}, { includeAA: true }, { threshold: 0.02 }]) {
				expect(pixelmatch(a, b, undefined, width, height, options)).toBe(
					upstream(a, b, undefined, width, height, options),
				);
			}
		}
	});

	it("writes through a misaligned output view", () => {
		const { a, b, width, height } = pairs[0];
		const misaligned = new Uint8Array(width * height * 4 + 1).subarray(1);
		const expected = new Uint8Array(width * height * 4);
		expect(pixelmatch(a, b, misaligned, width, height)).toBe(
			upstream(a, b, expected, width, height),
		);
		expect(Buffer.compare(misaligned, expected)).toBe(0);
	});

	it("throws pixelmatch's errors", () => {
		const image = new Uint8Array(16);
		const calls: Array<Parameters<typeof upstream>> = [
			[[] as unknown as Uint8Array, image, null, 2, 2],
			[image, new Uint8Array(12), null, 2, 2],
			[image, image, null, 3, 3],
			[image, image, null, 2, 2, { ignoreMask: new Uint8Array(3) }],
		];
		for (const args of calls) {
			const message = (() => {
				try {
					upstream(...args);
				} catch (error) {
					return (error as Error).message;
				}
			})();
			expect(message).toBeTruthy();
			expect(() => pixelmatch(...args)).toThrow(message);
		}
	});
});
