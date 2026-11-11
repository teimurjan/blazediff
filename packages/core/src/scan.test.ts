import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { fillGrayRange, grayTable } from "./gray";
import { colorDelta, diff, drawGrayPixel, type Image } from "./index";
import { YIQ_LAMBDA_MAX, YIQ_Y_B, YIQ_Y_G, YIQ_Y_R } from "./pixel";
import { nearMask } from "./scan";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

function loadPNG(relativePath: string): Image {
	const png = PNG.sync.read(readFileSync(join(FIXTURES_PATH, relativePath)));
	return {
		data: new Uint8Array(png.data),
		width: png.width,
		height: png.height,
	};
}

describe("nearMask", () => {
	it.each([0.05, 0.1])(
		"threshold %f: words that share the masked bits stay within threshold at every alpha",
		(threshold) => {
			const maxDelta = 35215 * threshold * threshold;
			const mask = nearMask(maxDelta / YIQ_LAMBDA_MAX);
			// The largest channel delta that the mask lets through.
			const reach = 0xff & ~mask;
			const a = new Uint8Array(4);
			const b = new Uint8Array(4);
			let worst = 0;
			for (let alpha = 0; alpha <= 255; alpha++) {
				a[3] = alpha;
				b[3] = alpha;
				for (let dr = 0; dr <= reach; dr++) {
					for (let dg = -reach; dg <= reach; dg++) {
						for (let db = -reach; db <= reach; db++) {
							a[0] = dr;
							a[1] = dg < 0 ? -dg : 0;
							a[2] = db < 0 ? -db : 0;
							b[1] = dg < 0 ? 0 : dg;
							b[2] = db < 0 ? 0 : db;
							const delta = Math.abs(colorDelta(a, b, 0, 0));
							if (delta > worst) worst = delta;
						}
					}
				}
			}
			expect(reach).toBeGreaterThan(0);
			expect(worst).toBeLessThanOrEqual(maxDelta);
		},
	);

	it("keeps only exact equality at threshold 0", () => {
		expect(nearMask(0)).toBe(-1);
	});
});

describe("fillGrayRange", () => {
	// The fill loop holds these as literals; see its doc comment.
	it("uses the YIQ luma weights times 2^22", () => {
		expect(Math.round(YIQ_Y_R * 2 ** 22)).toBe(1253658);
		expect(Math.round(YIQ_Y_G * 2 ** 22)).toBe(2460473);
		expect(Math.round(YIQ_Y_B * 2 ** 22)).toBe(480173);
	});

	it.each([0.1, 1, 0.37])(
		"alpha %f: matches drawGrayPixel on every opaque color",
		(alpha) => {
			const colors = 1 << 24;
			const image = new Int32Array(colors);
			for (let color = 0; color < colors; color++)
				image[color] = color | 0xff000000;
			const out = new Int32Array(colors);
			const table = grayTable(alpha);
			for (let from = 0; from < colors; from += 4096)
				fillGrayRange(image, out, from, from + 4096, table, alpha);

			const bytes = new Uint8Array(image.buffer);
			const expected = new Uint8Array(bytes.length);
			const expectedWords = new Int32Array(expected.buffer);
			let mismatches = 0;
			for (let color = 0; color < colors; color++) {
				drawGrayPixel(bytes, color * 4, alpha, expected);
				if (out[color] !== expectedWords[color]) mismatches++;
			}
			expect(mismatches).toBe(0);
		},
	);

	it("leaves the table empty for an alpha outside [0, 1]", () => {
		expect(grayTable(1.5).every((word) => word === 0)).toBe(true);
		expect(grayTable(Number.NaN).every((word) => word === 0)).toBe(true);
	});
});

describe("antialiased fast path", () => {
	// Its neighbour ranking by exact luma needs this; see antialiasedOpaque.
	it("no two different color deltas share a luma", () => {
		const r = Math.round(YIQ_Y_R * 1e8);
		const g = Math.round(YIQ_Y_G * 1e8);
		const b = Math.round(YIQ_Y_B * 1e8);
		expect([r / 2, g / 2, b / 2]).toEqual([14944765.5, 29331123.5, 5724111.5]);
		// Two deltas in [-255, 255] differ by at most 510 per channel.
		let collisions = 0;
		for (let dr = -510; dr <= 510; dr++) {
			for (let dg = -510; dg <= 510; dg++) {
				const partial = r * dr + g * dg;
				const db = -Math.round(partial / b);
				if (dr === 0 && dg === 0 && db === 0) continue;
				if (Math.abs(db) <= 510 && partial + b * db === 0) collisions++;
			}
		}
		expect(collisions).toBe(0);
	});
});

describe("word and byte paths", () => {
	const options = [
		{},
		{ threshold: 0.02 },
		{ antialiasing: false },
		{ render: { background: "transparent" as const } },
		{
			render: {
				alpha: 0.6,
				diffColorAlt: [0, 255, 0] as [number, number, number],
			},
		},
	];

	it.each([
		"pixelmatch/1",
		"pixelmatch/4",
		"pixelmatch/5",
		"blazediff/1",
		"alpha/1",
	])("%s: an aligned and a misaligned output hold the same bytes", (name) => {
		const a = loadPNG(`${name}a.png`);
		const b = loadPNG(`${name}b.png`);
		const bytes = a.data.length;
		for (const option of options) {
			const aligned = { ...a, data: new Uint8Array(bytes) };
			const misaligned = {
				...a,
				data: new Uint8Array(bytes + 1).subarray(1),
			};
			const counted = diff(a, b, option);
			expect(diff(a, b, { ...option, output: aligned })).toEqual(counted);
			expect(diff(a, b, { ...option, output: misaligned })).toEqual(counted);
			expect(Buffer.compare(aligned.data, misaligned.data)).toBe(0);
		}
	});
});
