import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { compare, hasNativeBinding, milo, renderMap } from "./index";

const FIXTURES = join(__dirname, "../../../../fixtures");
const A = join(FIXTURES, "blazediff/1a.png");
const B = join(FIXTURES, "blazediff/1b.png");
/** A different size to 1a/1b, so the pair is a layout difference. */
const OTHER = join(FIXTURES, "blazediff/2b.png");

/**
 * What the authors' PyTorch implementation scores on the fixtures, as
 * exported by `crates/blazediff-milo/scripts/export-reference.py`. The crate
 * holds itself to these; this checks nothing is lost across the binding.
 */
const REFERENCE = JSON.parse(
	readFileSync(
		join(
			__dirname,
			"../../../../crates/blazediff-milo/tests/fixtures/reference.json",
		),
		"utf8",
	),
) as {
	fixtures: {
		reference: string;
		distorted: string;
		raw_error: number;
		mos: number;
	}[];
};

function expected(reference: string, distorted: string) {
	const found = REFERENCE.fixtures.find(
		(f) => f.reference === reference && f.distorted === distorted,
	);
	if (!found) throw new Error(`no reference for ${reference} vs ${distorted}`);
	return found;
}

function decode(file: string) {
	const png = PNG.sync.read(readFileSync(file));
	return { data: png.data, width: png.width, height: png.height };
}

/** Narrow to the scored variants of {@link MiloResult}. */
function scored(result: Awaited<ReturnType<typeof compare>>) {
	if ("rawError" in result) return result;
	throw new Error(`expected a scored result, got ${JSON.stringify(result)}`);
}

const scratch = mkdtempSync(join(tmpdir(), "blazediff-milo-native-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("binding", () => {
	it("loads on this platform", () => {
		expect(hasNativeBinding()).toBe(true);
	});
});

describe("compare", () => {
	it("calls an image identical to itself", async () => {
		const result = await compare(A, A);
		expect(result.match).toBe(true);
		expect(scored(result).rawError).toBe(0);
		// The learned MOS calibration tops out below 5 for identical input.
		expect(scored(result).mos).toBeCloseTo(4.346, 2);
	});

	it("scores a changed pair what PyTorch scores it", async () => {
		const result = await compare(A, B);
		expect(result.match).toBe(false);
		if (result.match || result.reason !== "error-above-threshold") {
			throw new Error("expected an error-above-threshold result");
		}
		const ref = expected("blazediff/1a.png", "blazediff/1b.png");
		expect(result.rawError).toBeCloseTo(ref.raw_error, 7);
		expect(result.mos).toBeCloseTo(ref.mos, 4);
		expect(result.width).toBe(1468);
		expect(result.height).toBe(294);
	});

	it("accepts a change under a lenient maxError", async () => {
		const result = await compare(A, B, undefined, { maxError: 0.01 });
		expect(result.match).toBe(true);
	});

	it("takes encoded buffers as well as paths", async () => {
		const fromPaths = await compare(A, B);
		const fromBuffers = await compare(readFileSync(A), readFileSync(B));
		expect(scored(fromBuffers).rawError).toBe(scored(fromPaths).rawError);
	});

	it("gives the same numbers on one thread", async () => {
		const parallel = await compare(A, B);
		const serial = await compare(A, B, undefined, { threads: 1 });
		expect(scored(serial).rawError).toBe(scored(parallel).rawError);
		expect(scored(serial).mos).toBe(scored(parallel).mos);
	});

	it("withholds the maps unless asked", async () => {
		const without = scored(await compare(A, B));
		expect(without.mask).toBeUndefined();
		expect(without.errorMap).toBeUndefined();

		const withMaps = scored(
			await compare(A, B, undefined, { returnMaps: true }),
		);
		expect(withMaps.mask).toBeInstanceOf(Float32Array);
		expect(withMaps.errorMap).toBeInstanceOf(Float32Array);
		expect(withMaps.mask?.length).toBe(1468 * 294);
		expect(withMaps.errorMap?.length).toBe(1468 * 294);
		expect(withMaps.errorMap?.some((v) => v > 0)).toBe(true);
	});

	it("renders the error map to a path", async () => {
		const output = join(scratch, "map.png");
		await compare(A, B, output);
		expect(statSync(output).size).toBeGreaterThan(0);
		const png = decode(output);
		expect([png.width, png.height]).toEqual([1468, 294]);
	});

	it("reports a layout difference for mismatched sizes", async () => {
		expect(await compare(A, OTHER)).toEqual({
			match: false,
			reason: "layout-diff",
		});
	});

	it("reports a missing file rather than throwing", async () => {
		const missing = join(FIXTURES, "does-not-exist.png");
		expect(await compare(missing, B)).toEqual({
			match: false,
			reason: "file-not-exists",
			file: missing,
		});
	});

	it("rejects mixed path and buffer inputs", async () => {
		await expect(compare(A, readFileSync(B))).rejects.toThrow(TypeError);
	});

	it("rejects images below the reference's 16px floor", async () => {
		const tiny = join(scratch, "tiny.png");
		const png = new PNG({ width: 15, height: 20 });
		png.data.fill(128);
		const { writeFileSync } = await import("node:fs");
		writeFileSync(tiny, PNG.sync.write(png));
		await expect(compare(tiny, tiny)).rejects.toThrow(/too small/);
	});
});

describe("milo", () => {
	it("agrees with compare over raw RGBA", async () => {
		const a = decode(A);
		const b = decode(B);
		const raw = milo(a.data, b.data, a.width, a.height);
		const viaPaths = scored(await compare(A, B));
		expect(scored(raw).rawError).toBe(viaPaths.rawError);
		expect(scored(raw).mos).toBe(viaPaths.mos);
	});

	it("throws for a buffer that cannot hold the pixels", () => {
		expect(() => milo(new Uint8Array(16), new Uint8Array(16), 32, 32)).toThrow(
			/bytes/,
		);
	});
});

describe("renderMap", () => {
	it("paints one opaque gray pixel per value", () => {
		const rgba = renderMap(new Float32Array([0, 0.5, 1, 2]), 2, 2);
		expect(rgba.length).toBe(16);
		expect(Array.from(rgba.subarray(0, 4))).toEqual([0, 0, 0, 255]);
		expect(Array.from(rgba.subarray(8, 12))).toEqual([255, 255, 255, 255]);
		expect(Array.from(rgba.subarray(12, 16))).toEqual([255, 255, 255, 255]);
	});
});
