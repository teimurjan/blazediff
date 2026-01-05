import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import {
	antialiased,
	brightnessDelta,
	calculateOptimalBlockSize,
	colorDelta,
	diff,
	drawGrayPixel,
	drawPixel,
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

describe("diff", () => {
	describe("error handling", () => {
		it("should throw for invalid image1 type", () => {
			const valid = new Uint8Array(16);
			expect(() => diff([1, 2, 3, 4] as any, valid, undefined, 2, 2)).toThrow(
				"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
			);
		});

		it("should throw for invalid image2 type", () => {
			const valid = new Uint8Array(16);
			expect(() => diff(valid, "invalid" as any, undefined, 2, 2)).toThrow(
				"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
			);
		});

		it("should throw for invalid output type", () => {
			const valid = new Uint8Array(16);
			expect(() => diff(valid, valid, {} as any, 2, 2)).toThrow(
				"Image data: Uint8Array, Uint8ClampedArray or Buffer expected.",
			);
		});

		it("should throw for mismatched image sizes", () => {
			const img1 = new Uint8Array(16);
			const img2 = new Uint8Array(32);
			expect(() => diff(img1, img2, undefined, 2, 2)).toThrow(
				"Image sizes do not match",
			);
		});

		it("should throw for mismatched output size", () => {
			const img = new Uint8Array(16);
			const output = new Uint8Array(32);
			expect(() => diff(img, img, output, 2, 2)).toThrow(
				"Image sizes do not match",
			);
		});

		it("should throw for incorrect buffer size vs dimensions", () => {
			const img = new Uint8Array(16);
			expect(() => diff(img, img, undefined, 10, 10)).toThrow(
				"Image data size does not match width/height",
			);
		});
	});

	describe("identical images", () => {
		it("should return 0 for identical images", () => {
			const img = createTestImage(10, 10, [128, 64, 32, 255]);
			expect(diff(img, img, undefined, 10, 10)).toBe(0);
		});

		it("should return 0 with fastBufferCheck disabled", () => {
			const img = createTestImage(10, 10, [128, 64, 32, 255]);
			expect(
				diff(img, img, undefined, 10, 10, { fastBufferCheck: false }),
			).toBe(0);
		});

		it("should fill output with grayscale for identical images", () => {
			const img = createTestImage(2, 2, [100, 100, 100, 255]);
			const output = new Uint8Array(16);
			diff(img, img, output, 2, 2);

			for (let i = 0; i < 4; i++) {
				expect(output[i * 4]).toBe(output[i * 4 + 1]);
				expect(output[i * 4 + 1]).toBe(output[i * 4 + 2]);
				expect(output[i * 4 + 3]).toBe(255);
			}
		});
	});

	describe("different images", () => {
		it("should detect completely different images", () => {
			const img1 = createTestImage(10, 10, [0, 0, 0, 255]);
			const img2 = createTestImage(10, 10, [255, 255, 255, 255]);
			const result = diff(img1, img2, undefined, 10, 10);
			expect(result).toBe(100);
		});

		it("should detect single pixel difference", () => {
			const img1 = createTestImage(3, 3, [128, 128, 128, 255]);
			const img2 = createTestImage(3, 3, [128, 128, 128, 255]);
			img2[16] = 0;
			img2[17] = 0;
			img2[18] = 0;
			const result = diff(img1, img2, undefined, 3, 3);
			expect(result).toBe(1);
		});

		it("should write diffColor for different pixels", () => {
			const img1 = createTestImage(2, 2, [0, 0, 0, 255]);
			const img2 = createTestImage(2, 2, [255, 255, 255, 255]);
			const output = new Uint8Array(16);
			diff(img1, img2, output, 2, 2, { diffColor: [255, 0, 0] });

			expect(output[0]).toBe(255);
			expect(output[1]).toBe(0);
			expect(output[2]).toBe(0);
		});
	});

	describe("options", () => {
		it("should respect threshold=0 (most sensitive)", () => {
			const img1 = createTestImage(3, 3, [100, 100, 100, 255]);
			const img2 = createTestImage(3, 3, [101, 100, 100, 255]);
			const result = diff(img1, img2, undefined, 3, 3, { threshold: 0 });
			expect(result).toBeGreaterThan(0);
		});

		it("should respect threshold=1 (least sensitive)", () => {
			const img1 = createTestImage(3, 3, [100, 100, 100, 255]);
			const img2 = createTestImage(3, 3, [150, 100, 100, 255]);
			const result = diff(img1, img2, undefined, 3, 3, { threshold: 1 });
			expect(result).toBe(0);
		});

		it("should apply custom diffColor", () => {
			const img1 = createTestImage(2, 2, [0, 0, 0, 255]);
			const img2 = createTestImage(2, 2, [255, 255, 255, 255]);
			const output = new Uint8Array(16);
			diff(img1, img2, output, 2, 2, { diffColor: [0, 255, 0] });

			expect(output[0]).toBe(0);
			expect(output[1]).toBe(255);
			expect(output[2]).toBe(0);
		});

		it("should apply diffColorAlt for darkening changes", () => {
			// When image1 is brighter and image2 is darker, delta is negative
			// diffColorAlt is used when delta < 0
			const brighter = createTestImage(2, 2, [200, 200, 200, 255]);
			const darker = createTestImage(2, 2, [50, 50, 50, 255]);
			const output = new Uint8Array(16);
			diff(brighter, darker, output, 2, 2, {
				diffColor: [255, 0, 0],
				diffColorAlt: [0, 0, 255],
			});

			// diffColorAlt should be used because delta < 0 (darkening)
			expect(output[0]).toBe(0);
			expect(output[1]).toBe(0);
			expect(output[2]).toBe(255);
		});

		it("should apply diffMask mode (transparent background)", () => {
			const img1 = createTestImage(3, 3, [128, 128, 128, 255]);
			const img2 = createTestImage(3, 3, [128, 128, 128, 255]);
			img2[16] = 0;
			img2[17] = 0;
			img2[18] = 0;

			const output = new Uint8Array(36);
			diff(img1, img2, output, 3, 3, { diffMask: true });

			expect(output[3]).toBe(0);
			expect(output[19]).toBe(255);
		});

		it("should include anti-aliased pixels when includeAA=true", () => {
			const img1 = createTestImage(3, 3, [128, 128, 128, 255]);
			const img2 = createTestImage(3, 3, [128, 128, 128, 255]);
			img2[16] = 255;
			img2[17] = 255;
			img2[18] = 255;

			const withAA = diff(img1, img2, undefined, 3, 3, { includeAA: true });
			const withoutAA = diff(img1, img2, undefined, 3, 3, { includeAA: false });

			expect(withAA).toBeGreaterThanOrEqual(withoutAA);
		});

		it("should apply custom alpha for output", () => {
			const img = createTestImage(2, 2, [128, 128, 128, 255]);
			const output1 = new Uint8Array(16);
			const output2 = new Uint8Array(16);

			diff(img, img, output1, 2, 2, { alpha: 0.1 });
			diff(img, img, output2, 2, 2, { alpha: 0.9 });

			expect(output1[0]).not.toBe(output2[0]);
		});
	});

	describe("buffer types", () => {
		it("should work with Buffer", () => {
			const img1 = Buffer.from(createTestImage(2, 2, [0, 0, 0, 255]));
			const img2 = Buffer.from(createTestImage(2, 2, [255, 255, 255, 255]));
			const result = diff(img1, img2, undefined, 2, 2);
			expect(result).toBe(4);
		});

		it("should work with Uint8ClampedArray", () => {
			const img1 = new Uint8ClampedArray(createTestImage(2, 2, [0, 0, 0, 255]));
			const img2 = new Uint8ClampedArray(
				createTestImage(2, 2, [255, 255, 255, 255]),
			);
			const result = diff(img1, img2, undefined, 2, 2);
			expect(result).toBe(4);
		});

		it("should work with mixed buffer types", () => {
			const img1 = new Uint8Array(createTestImage(2, 2, [0, 0, 0, 255]));
			const img2 = Buffer.from(createTestImage(2, 2, [255, 255, 255, 255]));
			const result = diff(img1, img2, undefined, 2, 2);
			expect(result).toBe(4);
		});
	});
});

describe("integration tests with PNG fixtures", () => {
	describe("identical images", () => {
		it("same/1a.png vs same/1b.png should return 0 (identical)", () => {
			const img1 = loadPNG("same/1a.png");
			const img2 = loadPNG("same/1b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBe(0);
		});
	});

	describe("pixelmatch test fixtures", () => {
		it("pixelmatch/1a.png vs 1b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/1a.png");
			const img2 = loadPNG("pixelmatch/1b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`106`);
		});

		it("pixelmatch/2a.png vs 2b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/2a.png");
			const img2 = loadPNG("pixelmatch/2b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`9730`);
		});

		it("pixelmatch/3a.png vs 3b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/3a.png");
			const img2 = loadPNG("pixelmatch/3b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`178`);
		});

		it("pixelmatch/4a.png vs 4b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/4a.png");
			const img2 = loadPNG("pixelmatch/4b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`6889`);
		});

		it("pixelmatch/5a.png vs 5b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/5a.png");
			const img2 = loadPNG("pixelmatch/5b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`6`);
		});

		it("pixelmatch/6a.png vs 6b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/6a.png");
			const img2 = loadPNG("pixelmatch/6b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`51`);
		});

		it("pixelmatch/7a.png vs 7b.png should detect differences", () => {
			const img1 = loadPNG("pixelmatch/7a.png");
			const img2 = loadPNG("pixelmatch/7b.png");
			const result = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
			);
			expect(result).toBeGreaterThan(0);
			expect(result).toMatchInlineSnapshot(`2448`);
		});
	});

	describe("consistency across runs", () => {
		it("should produce identical results for repeated comparisons", () => {
			const img1 = loadPNG("pixelmatch/1a.png");
			const img2 = loadPNG("pixelmatch/1b.png");

			const results = [];
			for (let i = 0; i < 5; i++) {
				results.push(
					diff(img1.data, img2.data, undefined, img1.width, img1.height),
				);
			}

			expect(new Set(results).size).toBe(1);
		});
	});

	describe("output buffer generation", () => {
		it("should generate valid diff visualization", () => {
			const img1 = loadPNG("pixelmatch/1a.png");
			const img2 = loadPNG("pixelmatch/1b.png");
			const output = new Uint8Array(img1.width * img1.height * 4);

			diff(img1.data, img2.data, output, img1.width, img1.height);

			let hasNonZero = false;
			for (let i = 0; i < output.length; i++) {
				if (output[i] !== 0) {
					hasNonZero = true;
					break;
				}
			}
			expect(hasNonZero).toBe(true);
		});

		it("should respect diffMask option with real images", () => {
			const img1 = loadPNG("pixelmatch/1a.png");
			const img2 = loadPNG("pixelmatch/1b.png");
			const output = new Uint8Array(img1.width * img1.height * 4);

			diff(img1.data, img2.data, output, img1.width, img1.height, {
				diffMask: true,
			});

			let hasTransparent = false;
			for (let i = 3; i < output.length; i += 4) {
				if (output[i] === 0) {
					hasTransparent = true;
					break;
				}
			}
			expect(hasTransparent).toBe(true);
		});
	});

	describe("threshold sensitivity with real images", () => {
		it("lower threshold should detect more differences", () => {
			const img1 = loadPNG("pixelmatch/1a.png");
			const img2 = loadPNG("pixelmatch/1b.png");

			const strict = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
				{
					threshold: 0.05,
				},
			);
			const loose = diff(
				img1.data,
				img2.data,
				undefined,
				img1.width,
				img1.height,
				{
					threshold: 0.3,
				},
			);

			expect(strict).toBeGreaterThanOrEqual(loose);
		});
	});
});
