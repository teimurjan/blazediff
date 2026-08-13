import { readdirSync } from "node:fs";
import hitchhikersSSIM from "@blazediff/ssim/hitchhikers-ssim";
import msssim from "@blazediff/ssim/msssim";
import ssimJs from "@blazediff/ssim/ssim";
import { describe, expect, it } from "vitest";
import { hitchhikersSsim, msSsim, ssim } from "./index";
import {
	type DecodedImage,
	decodeFixture,
	FIXTURES,
	scored,
} from "./test-helpers";

/**
 * The Rust crate's accumulation order is frozen to the TypeScript port so it
 * inherits that port's measured MATLAB agreement. This suite is the JS-side
 * half of that pin: if the two ever drift, one of them has moved and the
 * MATLAB claim is no longer transitive.
 *
 * The crate's own `tests/matlab_parity.rs` pins to 5e-6; the same bound applies
 * here because it is the same comparison, made from the other side.
 */
const PORT_TOLERANCE = 5e-6;

/** MS-SSIM needs 176px on the short edge for its default five scales. */
const MS_SSIM_MINIMUM = 176;

interface Pair {
	stem: string;
	a: DecodedImage;
	b: DecodedImage;
}

function pairs(): Pair[] {
	const stems = readdirSync(FIXTURES)
		.filter((name) => name.endsWith("a.png"))
		.map((name) => name.slice(0, -"a.png".length))
		.sort();

	return stems.flatMap((stem) => {
		const a = decodeFixture(`${stem}a.png`);
		const b = decodeFixture(`${stem}b.png`);
		// A mismatched pair has no score to compare; that path is covered by the
		// layout-diff test in index.test.ts.
		if (a.width !== b.width || a.height !== b.height) return [];
		return [{ stem, a, b }];
	});
}

const PAIRS = pairs();

describe("parity with @blazediff/ssim", () => {
	it("finds fixture pairs to compare", () => {
		expect(PAIRS.length).toBeGreaterThan(0);
	});

	for (const { stem, a, b } of PAIRS) {
		it(`ssim agrees on ${stem}`, () => {
			const expected = ssimJs(a.data, b.data, undefined, a.width, a.height);
			const actual = scored(ssim(a.data, b.data, a.width, a.height));
			expect(actual).toBeCloseTo(expected, 6);
			expect(Math.abs(actual - expected)).toBeLessThan(PORT_TOLERANCE);
		});

		it(`hitchhikers-ssim agrees on ${stem}`, () => {
			const expected = hitchhikersSSIM(
				a.data,
				b.data,
				undefined,
				a.width,
				a.height,
			);
			const actual = scored(hitchhikersSsim(a.data, b.data, a.width, a.height));
			expect(Math.abs(actual - expected)).toBeLessThan(PORT_TOLERANCE);
		});

		const shortEdge = Math.min(a.width, a.height);
		it.skipIf(shortEdge < MS_SSIM_MINIMUM)(`ms-ssim agrees on ${stem}`, () => {
			const expected = msssim(a.data, b.data, undefined, a.width, a.height);
			const actual = scored(msSsim(a.data, b.data, a.width, a.height));
			expect(Math.abs(actual - expected)).toBeLessThan(PORT_TOLERANCE);
		});
	}
});
