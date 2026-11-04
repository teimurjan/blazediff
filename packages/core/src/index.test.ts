import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
	antialiased,
	brightnessDelta,
	calculateOptimalBlockSize,
	colorDelta,
	type DiffOptions,
	diff,
	drawGrayPixel,
	drawPixel,
	type Image,
	isValidImage,
} from "./index";

const FIXTURES_PATH = join(__dirname, "../../../fixtures");

function loadPNG(relativePath: string): {
	data: Uint8Array;
	width: number;
	height: number;
} {
	const buffer = readFileSync(join(FIXTURES_PATH, relativePath));
	const png = PNG.sync.read(buffer);
	return {
		data: new Uint8Array(png.data),
		width: png.width,
		height: png.height,
	};
}

function createTestImage(
	width: number,
	height: number,
	fillColor: [number, number, number, number] = [0, 0, 0, 255],
): Uint8Array {
	const data = new Uint8Array(width * height * 4);
	for (let i = 0; i < width * height; i++) {
		data[i * 4] = fillColor[0];
		data[i * 4 + 1] = fillColor[1];
		data[i * 4 + 2] = fillColor[2];
		data[i * 4 + 3] = fillColor[3];
	}
	return data;
}

describe("isValidImage", () => {
	it("should return true for Uint8Array", () => {
		expect(isValidImage(new Uint8Array(4))).toBe(true);
	});

	it("should return true for Uint8ClampedArray", () => {
		expect(isValidImage(new Uint8ClampedArray(4))).toBe(true);
	});

	it("should return true for Buffer", () => {
		expect(isValidImage(Buffer.alloc(4))).toBe(true);
	});

	it("should return false for regular Array", () => {
		expect(isValidImage([0, 0, 0, 255])).toBe(false);
	});

	it("should return false for string", () => {
		expect(isValidImage("image")).toBe(false);
	});

	it("should return false for number", () => {
		expect(isValidImage(42)).toBe(false);
	});

	it("should return false for object", () => {
		expect(isValidImage({ data: [] })).toBe(false);
	});

	it("should return false for null", () => {
		expect(isValidImage(null)).toBe(false);
	});

	it("should return false for undefined", () => {
		expect(isValidImage(undefined)).toBe(false);
	});

	it("should return false for Uint16Array (wrong BYTES_PER_ELEMENT)", () => {
		expect(isValidImage(new Uint16Array(4))).toBe(false);
	});
});

describe("calculateOptimalBlockSize", () => {
	it("should return power of 2", () => {
		const sizes = [
			[100, 100],
			[800, 600],
			[1920, 1080],
			[4096, 4096],
		];
		for (const [w, h] of sizes) {
			const blockSize = calculateOptimalBlockSize(w, h);
			expect(Math.log2(blockSize) % 1).toBe(0);
		}
	});

	it("should return smaller blocks for small images", () => {
		const small = calculateOptimalBlockSize(50, 50);
		const large = calculateOptimalBlockSize(2000, 2000);
		expect(small).toBeLessThanOrEqual(large);
	});

	it("should handle 1x1 image", () => {
		const blockSize = calculateOptimalBlockSize(1, 1);
		expect(blockSize).toBeGreaterThanOrEqual(1);
	});

	it("should handle very large images", () => {
		const blockSize = calculateOptimalBlockSize(10000, 10000);
		expect(blockSize).toBeGreaterThanOrEqual(16);
	});
});

describe("colorDelta", () => {
	it("should return 0 for identical pixels", () => {
		const img = new Uint8Array([128, 64, 32, 255]);
		expect(colorDelta(img, img, 0, 0)).toBe(0);
	});

	it("should return non-zero for different pixels", () => {
		const img1 = new Uint8Array([255, 0, 0, 255]);
		const img2 = new Uint8Array([0, 255, 0, 255]);
		expect(colorDelta(img1, img2, 0, 0)).not.toBe(0);
	});

	it("should return positive delta when image1 is darker than image2 (y > 0)", () => {
		// When image1 pixel is darker than image2 pixel, y = dr*0.299 + dg*0.587 + db*0.114 is negative
		// which makes the function return positive delta (y > 0 ? -delta : delta)
		const darker = new Uint8Array([0, 0, 0, 255]);
		const brighter = new Uint8Array([255, 255, 255, 255]);
		const delta = colorDelta(darker, brighter, 0, 0);
		expect(delta).toBeGreaterThan(0);
	});

	it("should return negative delta when image1 is brighter than image2 (y < 0)", () => {
		// When image1 pixel is brighter than image2 pixel, y is positive
		// which makes the function return negative delta
		const brighter = new Uint8Array([255, 255, 255, 255]);
		const darker = new Uint8Array([0, 0, 0, 255]);
		const delta = colorDelta(brighter, darker, 0, 0);
		expect(delta).toBeLessThan(0);
	});

	it("should handle semi-transparent pixels", () => {
		const img1 = new Uint8Array([255, 0, 0, 128]);
		const img2 = new Uint8Array([255, 0, 0, 255]);
		const delta = colorDelta(img1, img2, 0, 0);
		expect(delta).not.toBe(0);
	});

	it("should handle fully transparent pixels", () => {
		const img1 = new Uint8Array([255, 0, 0, 0]);
		const img2 = new Uint8Array([0, 255, 0, 0]);
		const delta = colorDelta(img1, img2, 0, 0);
		expect(typeof delta).toBe("number");
	});
});

describe("brightnessDelta", () => {
	it("should return 0 for identical pixels", () => {
		const img = new Uint8Array([128, 64, 32, 255]);
		expect(brightnessDelta(img, img, 0, 0)).toBe(0);
	});

	it("should return negative for darker pixel", () => {
		const dark = new Uint8Array([0, 0, 0, 255]);
		const bright = new Uint8Array([255, 255, 255, 255]);
		const delta = brightnessDelta(dark, bright, 0, 0);
		expect(delta).toBeLessThan(0);
	});

	it("should return positive for brighter pixel", () => {
		const dark = new Uint8Array([0, 0, 0, 255]);
		const bright = new Uint8Array([255, 255, 255, 255]);
		const delta = brightnessDelta(bright, dark, 0, 0);
		expect(delta).toBeGreaterThan(0);
	});

	it("should handle alpha channel", () => {
		const img1 = new Uint8Array([255, 255, 255, 128]);
		const img2 = new Uint8Array([255, 255, 255, 255]);
		const delta = brightnessDelta(img1, img2, 0, 0);
		expect(delta).not.toBe(0);
	});
});

describe("drawPixel", () => {
	it("should write RGBA values correctly", () => {
		const output = new Uint8Array(4);
		drawPixel(output, 0, 255, 128, 64);
		expect(output[0]).toBe(255);
		expect(output[1]).toBe(128);
		expect(output[2]).toBe(64);
		expect(output[3]).toBe(255);
	});

	it("should write at correct position offset", () => {
		const output = new Uint8Array(8);
		drawPixel(output, 4, 100, 150, 200);
		expect(output[4]).toBe(100);
		expect(output[5]).toBe(150);
		expect(output[6]).toBe(200);
		expect(output[7]).toBe(255);
	});
});

describe("drawGrayPixel", () => {
	it("should draw grayscale based on luminance", () => {
		const image = new Uint8Array([128, 128, 128, 255]);
		const output = new Uint8Array(4);
		drawGrayPixel(image, 0, 0.1, output);
		expect(output[0]).toBe(output[1]);
		expect(output[1]).toBe(output[2]);
		expect(output[3]).toBe(255);
	});

	it("should apply alpha blending", () => {
		// Use mid-gray so alpha blending has visible effect
		const image = new Uint8Array([128, 128, 128, 255]);
		const output1 = new Uint8Array(4);
		const output2 = new Uint8Array(4);
		drawGrayPixel(image, 0, 0.1, output1);
		drawGrayPixel(image, 0, 0.9, output2);
		expect(output1[0]).not.toBe(output2[0]);
	});
});

describe("antialiased", () => {
	it("should return false for uniform pixel region", () => {
		const width = 5;
		const height = 5;
		const image = createTestImage(width, height, [128, 128, 128, 255]);
		const a32 = new Uint32Array(image.buffer);
		const b32 = new Uint32Array(image.buffer);

		const result = antialiased(image, 2, 2, width, height, a32, b32);
		expect(result).toBe(false);
	});

	it("should handle edge pixels", () => {
		const width = 3;
		const height = 3;
		const image = createTestImage(width, height);
		const a32 = new Uint32Array(image.buffer);
		const b32 = new Uint32Array(image.buffer);

		expect(() =>
			antialiased(image, 0, 0, width, height, a32, b32),
		).not.toThrow();
		expect(() =>
			antialiased(image, 2, 2, width, height, a32, b32),
		).not.toThrow();
	});
});

function image(
	width: number,
	height: number,
	fill: [number, number, number, number] = [0, 0, 0, 255],
): Image {
	return { data: createTestImage(width, height, fill), width, height };
}

function countOf(a: Image, b: Image, options?: DiffOptions): number {
	const result = diff(a, b, options);
	if (result.kind !== "compared") throw new Error(`got ${result.kind}`);
	return result.count;
}

/** 3x3 gray image whose center pixel turned black. */
function centerChanged(): [Image, Image] {
	const a = image(3, 3, [128, 128, 128, 255]);
	const b = image(3, 3, [128, 128, 128, 255]);
	b.data.fill(0, 16, 19);
	return [a, b];
}

describe("diff", () => {
	describe("invalid arguments", () => {
		const valid = image(2, 2);
		const cases: Array<[string, () => unknown, string]> = [
			[
				"a is not a byte array",
				() => diff({ ...valid, data: [1, 2, 3, 4] as never }, valid),
				"invalid-image",
			],
			[
				"b is not a byte array",
				() => diff(valid, { ...valid, data: "invalid" as never }),
				"invalid-image",
			],
			[
				"data does not match the size",
				() => diff({ ...valid, width: 10, height: 10 }, valid),
				"invalid-image",
			],
			[
				"output is not a byte array",
				() => diff(valid, valid, { output: { ...valid, data: {} as never } }),
				"invalid-output",
			],
			[
				"output has another size",
				() => diff(valid, valid, { output: image(4, 1) }),
				"invalid-output",
			],
			[
				"render.background is unknown",
				() => diff(valid, valid, { render: { background: "none" as "faded" } }),
				"invalid-option",
			],
		];
		for (const [label, run, code] of cases) {
			it(`throws ${code} when ${label}`, () => {
				expect(run).toThrowError(
					expect.objectContaining({ name: "BlazeDiffError", code }),
				);
			});
		}
	});

	it("reports a dimension mismatch instead of throwing", () => {
		expect(diff(image(2, 2), image(4, 1))).toEqual({
			kind: "dimension-mismatch",
			a: { width: 2, height: 2 },
			b: { width: 4, height: 1 },
		});
	});

	describe("identical images", () => {
		it("returns an identical result", () => {
			const img = image(10, 10, [128, 64, 32, 255]);
			expect(diff(img, img)).toEqual({
				kind: "compared",
				count: 0,
				percentage: 0,
				identical: true,
			});
		});

		it("fills the output with grayscale", () => {
			const img = image(2, 2, [100, 100, 100, 255]);
			const output = image(2, 2);
			diff(img, img, { output });
			for (let i = 0; i < 4; i++) {
				expect(output.data[i * 4]).toBe(output.data[i * 4 + 1]);
				expect(output.data[i * 4 + 1]).toBe(output.data[i * 4 + 2]);
				expect(output.data[i * 4 + 3]).toBe(255);
			}
		});
	});

	describe("different images", () => {
		it("counts every pixel of completely different images", () => {
			const result = diff(image(10, 10), image(10, 10, [255, 255, 255, 255]));
			expect(result).toEqual({
				kind: "compared",
				count: 100,
				percentage: 100,
				identical: false,
			});
		});

		it("detects a single pixel difference", () => {
			const [a, b] = centerChanged();
			expect(countOf(a, b)).toBe(1);
		});

		it("draws diffColor for different pixels", () => {
			const output = image(2, 2);
			diff(image(2, 2), image(2, 2, [255, 255, 255, 255]), { output });
			expect(Array.from(output.data.subarray(0, 3))).toEqual([255, 0, 0]);
		});
	});

	describe("options", () => {
		it("threshold 0 is the most sensitive", () => {
			const a = image(3, 3, [100, 100, 100, 255]);
			const b = image(3, 3, [101, 100, 100, 255]);
			expect(countOf(a, b, { threshold: 0 })).toBeGreaterThan(0);
		});

		it("threshold 1 is the least sensitive", () => {
			const a = image(3, 3, [100, 100, 100, 255]);
			const b = image(3, 3, [150, 100, 100, 255]);
			expect(countOf(a, b, { threshold: 1 })).toBe(0);
		});

		it("draws render.diffColor", () => {
			const output = image(2, 2);
			diff(image(2, 2), image(2, 2, [255, 255, 255, 255]), {
				output,
				render: { diffColor: [0, 255, 0] },
			});
			expect(Array.from(output.data.subarray(0, 3))).toEqual([0, 255, 0]);
		});

		it("draws render.diffColorAlt for darkening changes", () => {
			const output = image(2, 2);
			diff(image(2, 2, [200, 200, 200, 255]), image(2, 2, [50, 50, 50, 255]), {
				output,
				render: { diffColor: [255, 0, 0], diffColorAlt: [0, 0, 255] },
			});
			expect(Array.from(output.data.subarray(0, 3))).toEqual([0, 0, 255]);
		});

		it("render.background transparent clears unchanged pixels", () => {
			const [a, b] = centerChanged();
			const output = image(3, 3, [9, 9, 9, 9]);
			diff(a, b, { output, render: { background: "transparent" } });
			expect(output.data[3]).toBe(0);
			expect(output.data[19]).toBe(255);
		});

		it("antialiasing false counts at least as many pixels", () => {
			const a = image(3, 3, [128, 128, 128, 255]);
			const b = image(3, 3, [128, 128, 128, 255]);
			b.data.fill(255, 16, 19);
			expect(countOf(a, b, { antialiasing: false })).toBeGreaterThanOrEqual(
				countOf(a, b),
			);
		});

		it("render.alpha changes the faded background", () => {
			const img = image(2, 2, [128, 128, 128, 255]);
			const faint = image(2, 2);
			const strong = image(2, 2);
			diff(img, img, { output: faint, render: { alpha: 0.1 } });
			diff(img, img, { output: strong, render: { alpha: 0.9 } });
			expect(faint.data[0]).not.toBe(strong.data[0]);
		});
	});

	it("accepts Buffer, Uint8ClampedArray and mixed inputs", () => {
		const black = createTestImage(2, 2, [0, 0, 0, 255]);
		const white = createTestImage(2, 2, [255, 255, 255, 255]);
		const pairs: Array<[Image["data"], Image["data"]]> = [
			[Buffer.from(black), Buffer.from(white)],
			[new Uint8ClampedArray(black), new Uint8ClampedArray(white)],
			[new Uint8Array(black), Buffer.from(white)],
		];
		for (const [a, b] of pairs) {
			expect(
				countOf(
					{ data: a, width: 2, height: 2 },
					{ data: b, width: 2, height: 2 },
				),
			).toBe(4);
		}
	});
});

describe("integration tests with PNG fixtures", () => {
	it("same/1 is identical", () => {
		expect(countOf(loadPNG("same/1a.png"), loadPNG("same/1b.png"))).toBe(0);
	});

	it.each([
		[1, 106],
		[2, 9730],
		[3, 178],
		[4, 6889],
		[5, 6],
		[6, 51],
		[7, 2448],
	])("pixelmatch/%i counts %i pixels with the defaults", (n, expected) => {
		const a = loadPNG(`pixelmatch/${n}a.png`);
		const b = loadPNG(`pixelmatch/${n}b.png`);
		expect(countOf(a, b)).toBe(expected);
		expect(
			countOf(a, b, { output: { ...a, data: new Uint8Array(a.data.length) } }),
		).toBe(expected);
	});

	it("gives the same result on repeated runs", () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		const results = Array.from({ length: 5 }, () => countOf(a, b));
		expect(new Set(results).size).toBe(1);
	});

	it("leaves unchanged pixels transparent with background transparent", () => {
		const a = loadPNG("pixelmatch/1a.png");
		const output = { ...a, data: new Uint8Array(a.data.length) };
		diff(a, loadPNG("pixelmatch/1b.png"), {
			output,
			render: { background: "transparent" },
		});
		let transparent = false;
		for (let i = 3; i < output.data.length; i += 4) {
			if (output.data[i] === 0) {
				transparent = true;
				break;
			}
		}
		expect(transparent).toBe(true);
	});

	it("a lower threshold detects at least as many differences", () => {
		const a = loadPNG("pixelmatch/1a.png");
		const b = loadPNG("pixelmatch/1b.png");
		expect(countOf(a, b, { threshold: 0.05 })).toBeGreaterThanOrEqual(
			countOf(a, b, { threshold: 0.3 }),
		);
	});
});
