import { describe, expect, it } from "vitest";
import { hitchhikersSSIM } from "./hitchhikers-ssim";
import { msssim } from "./msssim";
import { ssim } from "./ssim";
import { scoreOf } from "./test-helpers";
import type { Image } from "./types";

function noise(width: number, height: number, seed: number): Image {
	const data = new Uint8Array(width * height * 4);
	let state = seed;
	for (let i = 0; i < data.length; i++) {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		data[i] = i % 4 === 3 ? 255 : state >>> 24;
	}
	return { data, width, height };
}

const variants = [
	["ssim", ssim],
	["msssim", msssim],
	["hitchhikersSSIM", hitchhikersSSIM],
] as const;

describe.each(variants)("%s", (_name, metric) => {
	const a = noise(192, 192, 1);
	const b = noise(192, 192, 2);

	it("reports a dimension mismatch instead of a score", () => {
		expect(metric(a, noise(192, 191, 3))).toEqual({
			kind: "dimension-mismatch",
			a: { width: 192, height: 192 },
			b: { width: 192, height: 191 },
		});
	});

	it("rejects a buffer that does not match its size", () => {
		expect(() => metric(a, { ...b, data: b.data.subarray(4) })).toThrow(
			"b.data is 147452 bytes, expected 147456 for 192x192.",
		);
	});

	it("rejects an output of the wrong size", () => {
		const output = noise(4, 4, 3);
		expect(() => metric(a, b, { output })).toThrow(
			"output is 4x4, expected 192x192.",
		);
	});

	it("scores the same with and without an output", () => {
		const output = noise(192, 192, 4);
		expect(scoreOf(metric(a, b, { output }))).toBe(scoreOf(metric(a, b)));
	});

	it("treats bitDepth 8 as the default dynamic range", () => {
		expect(scoreOf(metric(a, b, { bitDepth: 8 }))).toBe(scoreOf(metric(a, b)));
		expect(scoreOf(metric(a, b, { bitDepth: 16 }))).not.toBe(
			scoreOf(metric(a, b)),
		);
	});
});

describe("variant option blocks", () => {
	const a = noise(192, 192, 1);
	const b = noise(192, 192, 2);

	it("msssim takes its scale count from msSsim.weights", () => {
		const three = scoreOf(
			msssim(a, b, { msSsim: { weights: [0.2, 0.3, 0.5] } }),
		);
		expect(three).not.toBe(scoreOf(msssim(a, b)));
	});

	it("msssim rejects an unknown pooling method", () => {
		expect(() =>
			msssim(a, b, { msSsim: { method: "wtd_sum" as "product" } }),
		).toThrow(
			'Unknown msSsim.method: wtd_sum. Expected "product" or "weighted-sum".',
		);
	});

	it("ignores the other variants' blocks", () => {
		const blocks = {
			msSsim: { method: "weighted-sum" as const },
			hitchhikers: { covPooling: false },
		};
		expect(scoreOf(ssim(a, b, blocks))).toBe(scoreOf(ssim(a, b)));
	});
});
