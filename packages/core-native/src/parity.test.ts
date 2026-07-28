/**
 * Cross-engine parity: `@blazediff/core-native` (Rust) must agree with
 * `@blazediff/core` (JS) on the same inputs.
 *
 * These are two implementations of one documented algorithm behind one public
 * API, so a user switching engines — JS in CI, native locally — must get the
 * same answer. Without this harness the two silently diverged on transparency
 * for several releases: the Rust engine blended semi-transparent pixels against
 * white while the JS engine used the procedural checkerboard from FORMULA.md,
 * so `fixtures/pixelmatch/5` reported 256 diffs natively and 208 in JS.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import blazediffCore from "@blazediff/core";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { compare } from "./index";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

/** Every `<dir>/<n>` whose `a.png`/`b.png` pair exists and has matching dimensions. */
function fixturePairs(): string[] {
	const pairs: string[] = [];
	for (const dir of readdirSync(FIXTURES_PATH)) {
		const dirPath = join(FIXTURES_PATH, dir);
		if (!statSync(dirPath).isDirectory()) continue;
		for (const file of readdirSync(dirPath)) {
			if (!file.endsWith("a.png")) continue;
			const name = `${dir}/${file.slice(0, -5)}`;
			try {
				const a = PNG.sync.read(
					readFileSync(join(FIXTURES_PATH, `${name}a.png`)),
				);
				const b = PNG.sync.read(
					readFileSync(join(FIXTURES_PATH, `${name}b.png`)),
				);
				if (a.width === b.width && a.height === b.height) pairs.push(name);
			} catch {
				// unreadable or unpaired — not a parity case
			}
		}
	}
	return pairs.sort();
}

function countNonOpaque(png: PNG): number {
	let n = 0;
	for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) n++;
	return n;
}

const PAIRS = fixturePairs();
const THRESHOLDS = [0.05, 0.1, 0.2];

describe("JS/native parity", () => {
	it("finds fixtures to compare", () => {
		expect(PAIRS.length).toBeGreaterThan(0);
	});

	// AA detection is deliberately excluded here: the two engines have a
	// separate, pre-existing divergence in the anti-aliasing detector that is
	// unrelated to colour handling (see the `it.fails` case at the bottom).
	// Pinning the colour path first keeps this suite meaningful.
	describe.each(THRESHOLDS)("threshold %s (AA off)", (threshold) => {
		it.each(PAIRS)("%s", async (name) => {
			const pathA = join(FIXTURES_PATH, `${name}a.png`);
			const pathB = join(FIXTURES_PATH, `${name}b.png`);
			const a = PNG.sync.read(readFileSync(pathA));
			const b = PNG.sync.read(readFileSync(pathB));

			const js = blazediffCore(
				new Uint8Array(a.data),
				new Uint8Array(b.data),
				undefined,
				a.width,
				a.height,
				{ threshold, includeAA: true, fastBufferCheck: false },
			);

			const result = await compare(pathA, pathB, undefined, {
				threshold,
				antialiasing: false,
			});
			const native =
				result.match === true ? 0 : (result as { diffCount: number }).diffCount;

			expect(native).toBe(js);
		});
	});

	it("covers fixtures that actually contain transparency", () => {
		// Guards against the blended branch silently losing coverage: the bug
		// this suite exists for is invisible on fully opaque images.
		const withAlpha = PAIRS.filter((name) => {
			const a = PNG.sync.read(
				readFileSync(join(FIXTURES_PATH, `${name}a.png`)),
			);
			return countNonOpaque(a) > 0;
		});
		expect(withAlpha.length).toBeGreaterThanOrEqual(2);
	});

	it("agrees on the semi-transparent regression fixture", async () => {
		// pixelmatch/5 is the canary: 32,896 non-opaque pixels, and the exact
		// case where the engines used to report 208 (JS) vs 256 (native).
		const pathA = join(FIXTURES_PATH, "pixelmatch/5a.png");
		const pathB = join(FIXTURES_PATH, "pixelmatch/5b.png");
		const a = PNG.sync.read(readFileSync(pathA));
		const b = PNG.sync.read(readFileSync(pathB));

		const js = blazediffCore(
			new Uint8Array(a.data),
			new Uint8Array(b.data),
			undefined,
			a.width,
			a.height,
			{ threshold: 0.1, includeAA: true, fastBufferCheck: false },
		);
		const result = await compare(pathA, pathB, undefined, {
			threshold: 0.1,
			antialiasing: false,
		});
		const native =
			result.match === true ? 0 : (result as { diffCount: number }).diffCount;

		expect(js).toBe(208);
		expect(native).toBe(208);
	});
});

describe("JS/native parity with AA detection", () => {
	// KNOWN DIVERGENCE, pre-dating the alpha-blending fix and independent of it:
	// the two anti-aliasing detectors disagree on a handful of pixels even on
	// fully opaque images (4k/1 differs by 20 of ~73,000; page/2 by 107). The
	// colour metric is identical on these inputs, so the cause is inside the
	// neighbour scan, not the YIQ delta.
	//
	// Marked `fails` so the suite documents the gap and tells us the moment it
	// is fixed, rather than silently tolerating it.
	it.fails("matches on 4k/1 with AA enabled", async () => {
		const pathA = join(FIXTURES_PATH, "4k/1a.png");
		const pathB = join(FIXTURES_PATH, "4k/1b.png");
		const a = PNG.sync.read(readFileSync(pathA));
		const b = PNG.sync.read(readFileSync(pathB));

		const js = blazediffCore(
			new Uint8Array(a.data),
			new Uint8Array(b.data),
			undefined,
			a.width,
			a.height,
			{ threshold: 0.1, includeAA: false, fastBufferCheck: false },
		);
		const result = await compare(pathA, pathB, undefined, {
			threshold: 0.1,
			antialiasing: true,
		});
		const native =
			result.match === true ? 0 : (result as { diffCount: number }).diffCount;

		expect(native).toBe(js);
	});
});
