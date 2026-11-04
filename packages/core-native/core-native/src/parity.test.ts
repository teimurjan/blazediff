/**
 * Cross-engine parity: `@blazediff/core-native` (Rust) must agree with
 * `@blazediff/core` (JS) on the same inputs.
 *
 * These are two implementations of one documented algorithm behind one public
 * API, so a user switching engines (JS in CI, native locally) must get the
 * same answer. Without this harness the two silently diverged on transparency
 * for several releases: the Rust engine blended semi-transparent pixels against
 * white while the JS engine used the procedural checkerboard from FORMULA.md,
 * so `fixtures/pixelmatch/5` reported 256 diffs natively and 208 in JS.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { diff as coreDiff, type DiffOptions } from "@blazediff/core";
import { PNG } from "pngjs";
import { beforeEach, describe, expect, it } from "vitest";
import { BlazeDiffError, diff } from "./index";

const FIXTURES_PATH = join(__dirname, "../../../../fixtures");

interface FixturePair {
	name: string;
	/** Whether `a.png` has any non-opaque pixel. */
	hasAlpha: boolean;
}

/**
 * Every `<dir>/<n>` whose `a.png`/`b.png` pair exists and has matching
 * dimensions.
 *
 * Alpha is recorded here rather than re-derived in a test body: decoding the
 * 4k fixtures takes seconds, and a second pass over them blew the default
 * per-test timeout on CI hardware.
 */
function fixturePairs(): FixturePair[] {
	const pairs: FixturePair[] = [];
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
				if (a.width === b.width && a.height === b.height)
					pairs.push({ name, hasAlpha: hasNonOpaquePixel(a) });
			} catch {
				// unreadable or unpaired, so not a parity case
			}
		}
	}
	return pairs.sort((x, y) => x.name.localeCompare(y.name));
}

function hasNonOpaquePixel(png: PNG): boolean {
	for (let i = 3; i < png.data.length; i += 4)
		if (png.data[i] !== 255) return true;
	return false;
}

/** Results from both engines for one fixture, with the same options. */
async function bothEngines(name: string, options: DiffOptions = {}) {
	const pathA = join(FIXTURES_PATH, `${name}a.png`);
	const pathB = join(FIXTURES_PATH, `${name}b.png`);
	const a = PNG.sync.read(readFileSync(pathA));
	const b = PNG.sync.read(readFileSync(pathB));
	const js = coreDiff(
		{ data: new Uint8Array(a.data), width: a.width, height: a.height },
		{ data: new Uint8Array(b.data), width: b.width, height: b.height },
		options,
	);
	const native = await diff(pathA, pathB, options);
	return { js, native };
}

function countOf(result: { kind: string; count?: number }): number {
	if (result.kind !== "compared") throw new Error(`unexpected ${result.kind}`);
	return result.count as number;
}

// The diffs are synchronous, so yield between tests to let the worker answer
// vitest's RPC calls before they time out.
beforeEach(() => new Promise((resolve) => setImmediate(resolve)));

const FIXTURES = fixturePairs();
const PAIRS = FIXTURES.map(({ name }) => name);
const PAIRS_WITH_ALPHA = FIXTURES.filter(({ hasAlpha }) => hasAlpha);
const THRESHOLDS = [0.05, 0.1, 0.2];
const SMALL_PAIRS = PAIRS.filter((name) => !/^(4k|page)\//.test(name));

describe("JS/native parity", () => {
	it("finds fixtures to compare", () => {
		expect(PAIRS.length).toBeGreaterThan(0);
	});

	// AA detection is deliberately off here: the two YIQ anti-aliasing
	// detectors have a separate, pre-existing divergence that is unrelated to
	// colour handling (pinned below). Pinning the colour path first keeps this
	// suite meaningful.
	describe.each(THRESHOLDS)("threshold %s (AA counted)", (threshold) => {
		it.each(PAIRS)("%s", async (name) => {
			const { js, native } = await bothEngines(name, {
				threshold,
				antialiasing: false,
			});
			expect(native).toEqual(js);
		});
	});

	it("covers fixtures that actually contain transparency", () => {
		// Guards against the blended branch silently losing coverage: the bug
		// this suite exists for is invisible on fully opaque images.
		expect(PAIRS_WITH_ALPHA.length).toBeGreaterThanOrEqual(2);
	});

	it("agrees on the semi-transparent regression fixture", async () => {
		// pixelmatch/5 is the canary: 32,896 non-opaque pixels, and the exact
		// case where the engines used to report 208 (JS) vs 256 (native).
		const { js, native } = await bothEngines("pixelmatch/5", {
			antialiasing: false,
		});
		expect(countOf(js)).toBe(208);
		expect(countOf(native)).toBe(208);
	});
});

describe("JS/native parity with the default AA detection", () => {
	// The AA detector runs its neighbour scan through the same alpha-aware
	// brightness delta as the colour path, so transparency has to be covered
	// here too, not just with detection off.
	it.each(["alpha/1", "pixelmatch/5"])(
		"matches on the semi-transparent fixture %s",
		async (name) => {
			const { js, native } = await bothEngines(name);
			expect(native).toEqual(js);
		},
	);

	// KNOWN DIVERGENCE, pre-dating the alpha-blending fix and independent of it:
	// the two YIQ anti-aliasing detectors visit neighbours in a different order
	// and disagree on a handful of pixels on large fully opaque images. The
	// colour metric is identical on these inputs (both engines agree exactly
	// with AA counted), so the cause is inside the neighbour scan.
	//
	// Pinned to the exact counts rather than marked `fails`: that way closing
	// the gap, widening it, or losing the fixture entirely all break the suite,
	// where `fails` would have swallowed every one of them.
	it.each([
		{ name: "4k/1", js: 69_932, native: 69_912 },
		{ name: "page/2", js: 90_668, native: 90_606 },
	])("diverges by a known amount on $name", async ({ name, js, native }) => {
		const actual = await bothEngines(name);
		expect(countOf(actual.js)).toBe(js);
		expect(countOf(actual.native)).toBe(native);
	});
});

describe("JS/native parity for metric, mask and window", () => {
	// Unlike YIQ, the OKLab detector visits neighbours in pixelmatch's order
	// in both engines, so AA detection is covered too. With a window, the
	// busiest window's position must match as well.
	it.each(PAIRS)("oklab agrees on %s", async (name) => {
		const png = PNG.sync.read(
			readFileSync(join(FIXTURES_PATH, `${name}a.png`)),
		);
		const mask = new Uint8Array(png.width * png.height);
		for (let i = 0; i < mask.length; i += 7) mask[i] = 1;
		const cases: DiffOptions[] = [
			{ metric: "oklab" },
			{ metric: "oklab", antialiasing: false },
			{ metric: "oklab", threshold: 0.05 },
			{ metric: "oklab", mask, window: 16 },
		];
		for (const options of cases) {
			const { js, native } = await bothEngines(name, options);
			expect(
				native,
				`antialiasing=${options.antialiasing} threshold=${options.threshold} mask=${!!options.mask} window=${options.window}`,
			).toEqual(js);
		}
	});

	it.each(SMALL_PAIRS)(
		"yiq agrees with a mask and a window on %s (AA counted)",
		async (name) => {
			const png = PNG.sync.read(
				readFileSync(join(FIXTURES_PATH, `${name}a.png`)),
			);
			const mask = new Uint8Array(png.width * png.height);
			for (let i = 0; i < mask.length; i += 7) mask[i] = 1;
			for (const options of [{ mask }, { window: 8 }]) {
				const { js, native } = await bothEngines(name, {
					...options,
					antialiasing: false,
				});
				expect(native).toEqual(js);
			}
		},
	);

	it("rejects an unknown metric", async () => {
		const fixture = join(FIXTURES_PATH, `${PAIRS[0]}a.png`);
		await expect(
			diff(fixture, fixture, { metric: "lab" as "oklab" }),
		).rejects.toThrow(BlazeDiffError);
	});
});
