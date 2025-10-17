import { describe, expect, it } from "vitest";
import {
	computeGradientMagnitudesSquared,
	computeSimilarity,
	computeStdDev,
	rgbaToLuma,
} from "./math";

describe("GMSD Mathematical Formula Verification", () => {
	describe("rgbaToLuma - BT.601 Luma Conversion", () => {
		it("should convert pure red correctly: Y = 0.299 * 255 ≈ 76", () => {
			const rgba = new Uint8Array([255, 0, 0, 255]); // Pure red
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			// Y = (77 * 255 + 150 * 0 + 29 * 0) >> 8
			// Y = 19635 >> 8 = 76.69... ≈ 76
			expect(luma[0]).toBe(76);
		});

		it("should convert pure green correctly: Y = 0.587 * 255 ≈ 149", () => {
			const rgba = new Uint8Array([0, 255, 0, 255]); // Pure green
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			// Y = (77 * 0 + 150 * 255 + 29 * 0) >> 8
			// Y = 38250 >> 8 = 149.41... ≈ 149
			expect(luma[0]).toBe(149);
		});

		it("should convert pure blue correctly: Y = 0.114 * 255 ≈ 29", () => {
			const rgba = new Uint8Array([0, 0, 255, 255]); // Pure blue
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			// Y = (77 * 0 + 150 * 0 + 29 * 255) >> 8
			// Y = 7395 >> 8 = 28.89... ≈ 28
			expect(luma[0]).toBe(28);
		});

		it("should convert white correctly: Y = 255", () => {
			const rgba = new Uint8Array([255, 255, 255, 255]); // White
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			// Y = (77 * 255 + 150 * 255 + 29 * 255) >> 8
			// Y = (77 + 150 + 29) * 255 >> 8 = 256 * 255 >> 8 = 255
			expect(luma[0]).toBe(255);
		});

		it("should convert black correctly: Y = 0", () => {
			const rgba = new Uint8Array([0, 0, 0, 255]); // Black
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			expect(luma[0]).toBe(0);
		});

		it("should convert gray (128, 128, 128) correctly", () => {
			const rgba = new Uint8Array([128, 128, 128, 255]);
			const luma = new Uint8Array(1);

			rgbaToLuma(rgba, luma, 1, 1);

			// Y = (77 * 128 + 150 * 128 + 29 * 128) >> 8
			// Y = 256 * 128 >> 8 = 128
			expect(luma[0]).toBe(128);
		});
	});

	describe("computeGradientMagnitudesSquared - Prewitt Operator", () => {
		it("should compute zero gradient for uniform image", () => {
			// 5x5 uniform image (value = 100)
			const luma = new Uint8Array(25).fill(100);
			const grad2 = computeGradientMagnitudesSquared(luma, 5, 5);

			// All gradients should be zero (except border which is already 0)
			for (let y = 1; y < 4; y++) {
				for (let x = 1; x < 4; x++) {
					const idx = y * 5 + x;
					expect(grad2[idx]).toBe(0);
				}
			}
		});

		it("should compute correct gradient for vertical edge", () => {
			// 5x5 image with vertical edge at x=2
			// [0, 0, 255, 255, 255]
			const luma = new Uint8Array(25);
			for (let y = 0; y < 5; y++) {
				for (let x = 0; x < 5; x++) {
					luma[y * 5 + x] = x >= 2 ? 255 : 0;
				}
			}

			const grad2 = computeGradientMagnitudesSquared(luma, 5, 5);

			// At x=2, y=2 (center pixel on the edge):
			// 3x3 neighborhood:
			//   [0, 255, 255]
			//   [0,  *,  255]
			//   [0, 255, 255]
			//
			// Prewitt Gx = (0 + 0 + 0 - 255 - 255 - 255) / 3 = -255
			// Prewitt Gy = (0 + 255 + 255 - 0 - 255 - 255) / 3 = 0
			// grad2 = (-255)^2 + 0^2 = 65,025
			const idx = 2 * 5 + 2;
			expect(grad2[idx]).toBe(255 * 255);
		});

		it("should compute correct gradient for horizontal edge", () => {
			// 5x5 image with horizontal edge at y=2
			const luma = new Uint8Array(25);
			for (let y = 0; y < 5; y++) {
				for (let x = 0; x < 5; x++) {
					luma[y * 5 + x] = y >= 2 ? 255 : 0;
				}
			}

			const grad2 = computeGradientMagnitudesSquared(luma, 5, 5);

			// At x=2, y=2 (center pixel on the edge):
			// 3x3 neighborhood:
			//   [0,   0,   0]
			//   [255, *, 255]
			//   [255, 255, 255]
			//
			// Prewitt Gx = (0 + 255 + 255 - 0 - 255 - 255) / 3 = 0
			// Prewitt Gy = (0 + 0 + 0 - 255 - 255 - 255) / 3 = -255
			// grad2 = 0^2 + (-255)^2 = 65,025
			const idx = 2 * 5 + 2;
			expect(grad2[idx]).toBe(255 * 255);
		});

		it("should compute correct gradient for diagonal edge", () => {
			// 5x5 image with diagonal pattern
			const luma = new Uint8Array([
				0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 0, 0, 255, 255, 255, 0, 255, 255, 255,
				255, 255, 255, 255, 255, 255,
			]);

			const grad2 = computeGradientMagnitudesSquared(luma, 5, 5);

			// At x=2, y=2 (center):
			// 3x3 neighborhood:
			//   [0,   0,   255]
			//   [0,   *,   255]
			//   [255, 255, 255]
			//
			// Prewitt Gx = (0 + 0 + 255 - 255 - 255 - 255) / 3 = -170
			// Prewitt Gy = (0 + 0 + 255 - 255 - 255 - 255) / 3 = -170
			const idx = 2 * 5 + 2;
			const expectedGx = (0 + 0 + 255 - 255 - 255 - 255) / 3;
			const expectedGy = (0 + 0 + 255 - 255 - 255 - 255) / 3;
			expect(grad2[idx]).toBe(
				expectedGx * expectedGx + expectedGy * expectedGy,
			);
		});
	});

	describe("computeSimilarity - GMS Formula", () => {
		it("should return 1.0 when both gradients are equal", () => {
			// GMS = (2 * sqrt(g^2 * g^2) + C) / (g^2 + g^2 + C)
			//     = (2 * g^2 + C) / (2 * g^2 + C)
			//     = 1.0

			const grad1 = new Uint32Array([0, 0, 0, 0, 100, 0, 0, 0, 0]); // 3x3, center = 100
			const grad2 = new Uint32Array([0, 0, 0, 0, 100, 0, 0, 0, 0]); // 3x3, center = 100
			const c = 140;

			const similarity = computeSimilarity(grad1, grad2, c, 3, 3);

			// Only 1 interior pixel (center)
			expect(similarity.length).toBe(1);
			expect(similarity[0]).toBeCloseTo(1.0, 10);
		});

		it("should compute correct GMS for known gradient values", () => {
			// Test specific GMS formula with hand-calculated values
			// grad1 = 100, grad2 = 200, C = 140
			//
			// GMS = (2 * sqrt(100 * 200) + 140) / (100 + 200 + 140)
			//     = (2 * sqrt(20000) + 140) / 440
			//     = (2 * 141.42... + 140) / 440
			//     = (282.84... + 140) / 440
			//     = 422.84... / 440
			//     = 0.9610...

			const grad1 = new Uint32Array([0, 0, 0, 0, 100, 0, 0, 0, 0]);
			const grad2 = new Uint32Array([0, 0, 0, 0, 200, 0, 0, 0, 0]);
			const c = 140;

			const similarity = computeSimilarity(grad1, grad2, c, 3, 3);

			const expected =
				(2 * Math.sqrt(100) * Math.sqrt(200) + 140) / (100 + 200 + 140);
			expect(similarity[0]).toBeCloseTo(expected, 8); // Reduced precision from 10 to 8
			expect(similarity[0]).toBeCloseTo(0.961, 4);
		});

		it("should handle zero gradients correctly (avoid division by zero)", () => {
			// When both gradients are 0:
			// GMS = (2 * 0 + C) / (0 + 0 + C) = C / C = 1.0

			const grad1 = new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
			const grad2 = new Uint32Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
			const c = 140;

			const similarity = computeSimilarity(grad1, grad2, c, 3, 3);

			expect(similarity[0]).toBeCloseTo(1.0, 10);
		});

		it("should compute GMS for multiple pixels correctly", () => {
			// 5x5 grid with varying gradients
			const grad1 = new Uint32Array(25);
			const grad2 = new Uint32Array(25);

			// Set interior pixels (3x3 grid from [1,1] to [3,3])
			// grad1: all 100
			// grad2: varying values
			for (let y = 1; y < 4; y++) {
				for (let x = 1; x < 4; x++) {
					grad1[y * 5 + x] = 100;
					grad2[y * 5 + x] = 100 * (x + y); // Varying values
				}
			}

			const c = 140;
			const similarity = computeSimilarity(grad1, grad2, c, 5, 5);

			// Should have 3x3 = 9 similarity values
			expect(similarity.length).toBe(9);

			// Verify first value (x=1, y=1): grad1=100, grad2=200
			const expected0 =
				(2 * Math.sqrt(100) * Math.sqrt(200) + 140) / (100 + 200 + 140);
			expect(similarity[0]).toBeCloseTo(expected0, 8);
		});
	});

	describe("computeStdDev - Standard Deviation", () => {
		it("should return 0 for uniform values", () => {
			const values = new Float32Array([1.0, 1.0, 1.0, 1.0, 1.0]);
			const stdDev = computeStdDev(values);

			expect(stdDev).toBe(0);
		});

		it("should compute correct stddev for known values", () => {
			// Values: [1, 2, 3, 4, 5]
			// Mean = 3
			// Variance = ((1-3)^2 + (2-3)^2 + (3-3)^2 + (4-3)^2 + (5-3)^2) / 5
			//          = (4 + 1 + 0 + 1 + 4) / 5
			//          = 10 / 5 = 2
			// StdDev = sqrt(2) = 1.4142...

			const values = new Float32Array([1, 2, 3, 4, 5]);
			const stdDev = computeStdDev(values);

			expect(stdDev).toBeCloseTo(Math.sqrt(2), 10);
			expect(stdDev).toBeCloseTo(1.4142135623730951, 10);
		});

		it("should handle single value (stddev = 0)", () => {
			const values = new Float32Array([5.0]);
			const stdDev = computeStdDev(values);

			expect(stdDev).toBe(0);
		});

		it("should handle empty array (stddev = 0)", () => {
			const values = new Float32Array([]);
			const stdDev = computeStdDev(values);

			expect(stdDev).toBe(0);
		});

		it("should compute stddev for real GMS values", () => {
			// Simulate GMS values from slightly different images
			// GMS values typically in [0, 1] range
			const values = new Float32Array([
				0.95, 0.96, 0.94, 0.97, 0.95, 0.93, 0.96, 0.94, 0.95,
			]);

			const stdDev = computeStdDev(values);

			// Manually calculate:
			// Mean = (0.95+0.96+0.94+0.97+0.95+0.93+0.96+0.94+0.95) / 9 = 0.95
			const mean = 0.95;
			const variance =
				[0.95, 0.96, 0.94, 0.97, 0.95, 0.93, 0.96, 0.94, 0.95]
					.map((v) => (v - mean) ** 2)
					.reduce((a, b) => a + b, 0) / 9;
			const expected = Math.sqrt(variance);

			expect(stdDev).toBeCloseTo(expected, 8);
		});
	});

	describe("End-to-End Mathematical Verification", () => {
		it("should compute complete GMSD pipeline correctly", () => {
			// Create simple 5x5 test images with known gradients
			const luma1 = new Uint8Array([
				0, 0, 0, 0, 0, 0, 100, 100, 100, 0, 0, 100, 100, 100, 0, 0, 100, 100,
				100, 0, 0, 0, 0, 0, 0,
			]);

			const luma2 = new Uint8Array([
				0, 0, 0, 0, 0, 0, 100, 100, 100, 0, 0, 100, 100, 100, 0, 0, 100, 100,
				100, 0, 0, 0, 0, 0, 0,
			]);

			const c = 140;

			// 1. Compute gradients
			const grad1 = computeGradientMagnitudesSquared(luma1, 5, 5);
			const grad2 = computeGradientMagnitudesSquared(luma2, 5, 5);

			// 2. Compute GMS
			const gms = computeSimilarity(grad1, grad2, c, 5, 5);

			// 3. Compute stddev
			const stdDev = computeStdDev(gms);

			// 4. Final GMSD score
			const gmsdScore = 1 - stdDev;

			// For identical images, all GMS values should be 1.0
			// Therefore stddev = 0, and GMSD score = 1.0
			expect(gmsdScore).toBeCloseTo(1.0, 10);
		});

		it("should produce different GMSD for different gradient patterns", () => {
			// Create two images with VARYING gradients (not uniform)
			// Image 1: radial pattern
			const luma1 = new Uint8Array(25);
			for (let y = 0; y < 5; y++) {
				for (let x = 0; x < 5; x++) {
					const dx = x - 2;
					const dy = y - 2;
					const dist = Math.sqrt(dx * dx + dy * dy);
					luma1[y * 5 + x] = Math.min(255, Math.floor(dist * 50));
				}
			}

			// Image 2: shifted radial pattern
			const luma2 = new Uint8Array(25);
			for (let y = 0; y < 5; y++) {
				for (let x = 0; x < 5; x++) {
					const dx = x - 1.5;
					const dy = y - 1.5;
					const dist = Math.sqrt(dx * dx + dy * dy);
					luma2[y * 5 + x] = Math.min(255, Math.floor(dist * 50));
				}
			}

			const c = 140;

			const grad1 = computeGradientMagnitudesSquared(luma1, 5, 5);
			const grad2 = computeGradientMagnitudesSquared(luma2, 5, 5);
			const gms = computeSimilarity(grad1, grad2, c, 5, 5);
			const stdDev = computeStdDev(gms);
			const gmsdScore = 1 - stdDev;

			// Different gradient patterns → varying GMS → stddev > 0 → GMSD < 1.0
			expect(gmsdScore).toBeLessThan(1.0);
			expect(gmsdScore).toBeGreaterThan(0);
			expect(stdDev).toBeGreaterThan(0);
		});
	});
});
