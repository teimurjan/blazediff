import { describe, expect, it } from "vitest";
import gmsd from "./index";

describe("GMSD - Gradient Magnitude Similarity Deviation", () => {
	describe("Identical Images", () => {
		it("should return 1.0 for identical flat images", () => {
			const width = 100;
			const height = 100;
			const image = new Uint8Array(width * height * 4).fill(128);

			const score = gmsd(image, image, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should return 1.0 for identical images with structure", () => {
			const width = 50;
			const height = 50;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create a gradient pattern
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = Math.floor((x + y) * 2.55);
					image1[idx] = value;
					image1[idx + 1] = value;
					image1[idx + 2] = value;
					image1[idx + 3] = 255;

					image2[idx] = value;
					image2[idx + 1] = value;
					image2[idx + 2] = value;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should return 1.0 for grayscale identical images", () => {
			const width = 100;
			const height = 100;
			const image = new Uint8Array(width * height).fill(128);

			const score = gmsd(image, image, undefined, width, height, {});

			expect(score).toBe(1.0);
		});
	});

	describe("Different Images", () => {
		it("should return < 1.0 for different gradient patterns", () => {
			const width = 100;
			const height = 100;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Horizontal stripes
			for (let i = 0; i < width * height * 4; i += 4) {
				const y = Math.floor(i / 4 / width);
				const value1 = Math.floor(y / 10) % 2 ? 255 : 0;
				image1[i] = value1;
				image1[i + 1] = value1;
				image1[i + 2] = value1;
				image1[i + 3] = 255;

				// Vertical stripes
				const x = (i / 4) % width;
				const value2 = Math.floor(x / 10) % 2 ? 255 : 0;
				image2[i] = value2;
				image2[i + 1] = value2;
				image2[i + 2] = value2;
				image2[i + 3] = 255;
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBeLessThan(1.0);
			expect(score).toBeGreaterThan(0);
			// Horizontal vs vertical stripes should be moderately different
			expect(score).toBeGreaterThan(0.3);
			expect(score).toBeLessThan(0.8);
		});

		it("should return high similarity for slightly shifted images", () => {
			const width = 100;
			const height = 100;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create circular gradient
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const dx = x - width / 2;
					const dy = y - height / 2;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const value1 = Math.min(255, Math.floor(dist * 2));

					image1[idx] = value1;
					image1[idx + 1] = value1;
					image1[idx + 2] = value1;
					image1[idx + 3] = 255;

					// Slightly shifted
					const dx2 = x - width / 2 - 2;
					const dy2 = y - height / 2 - 2;
					const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
					const value2 = Math.min(255, Math.floor(dist2 * 2));

					image2[idx] = value2;
					image2[idx + 1] = value2;
					image2[idx + 2] = value2;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBeGreaterThan(0.95);
			expect(score).toBeLessThan(1.0);
		});
	});

	describe("Luma Conversion (RGBA to Grayscale)", () => {
		it("should handle RGBA correctly with BT.601 coefficients", () => {
			const width = 10;
			const height = 10;

			// Create pure red image
			const redImage = new Uint8Array(width * height * 4);
			const grayImage = new Uint8Array(width * height * 4);

			for (let i = 0; i < width * height * 4; i += 4) {
				redImage[i] = 255; // R
				redImage[i + 1] = 0; // G
				redImage[i + 2] = 0; // B
				redImage[i + 3] = 255; // A

				// Equivalent gray value using BT.601: Y = 0.299*R + 0.587*G + 0.114*B
				// For pure red: Y = 0.299 * 255 = 76.245 ≈ 76
				const gray = 76;
				grayImage[i] = gray;
				grayImage[i + 1] = gray;
				grayImage[i + 2] = gray;
				grayImage[i + 3] = 255;
			}

			const scoreRed = gmsd(redImage, redImage, undefined, width, height, {});
			const scoreGray = gmsd(grayImage, grayImage, undefined, width, height, {});

			// Both should be identical to themselves
			expect(scoreRed).toBe(1.0);
			expect(scoreGray).toBe(1.0);
		});
	});

	describe("Downsampling", () => {
		it("should produce similar scores with and without downsampling", () => {
			const width = 100;
			const height = 100;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create gradient pattern
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const dx = x - width / 2;
					const dy = y - height / 2;
					const dist = Math.sqrt(dx * dx + dy * dy);
					const value1 = Math.min(255, Math.floor(dist * 2));

					image1[idx] = value1;
					image1[idx + 1] = value1;
					image1[idx + 2] = value1;
					image1[idx + 3] = 255;

					// Slightly different
					const dist2 = Math.sqrt(dx * dx + dy * dy) * 1.1;
					const value2 = Math.min(255, Math.floor(dist2 * 2));

					image2[idx] = value2;
					image2[idx + 1] = value2;
					image2[idx + 2] = value2;
					image2[idx + 3] = 255;
				}
			}

			const scoreFull = gmsd(image1, image2, undefined, width, height, {
				downsample: 0,
			});
			const scoreDownsampled = gmsd(image1, image2, undefined, width, height, {
				downsample: 1,
			});

			// Scores should be close (within 5%)
			expect(Math.abs(scoreFull - scoreDownsampled)).toBeLessThan(0.05);
		});

		it("should be faster with downsampling (sanity check structure)", () => {
			const width = 200;
			const height = 200;
			const image = new Uint8Array(width * height * 4).fill(128);

			// Just verify it works, actual speed testing is in benchmarks
			const score = gmsd(image, image, undefined, width, height, {
				downsample: 1,
			});

			expect(score).toBe(1.0);
		});
	});

	describe("Gradient Computation (Sobel)", () => {
		it("should detect horizontal edges", () => {
			const width = 20;
			const height = 20;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Image with horizontal edge in the middle
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = y < height / 2 ? 0 : 255;
					image1[idx] = value;
					image1[idx + 1] = value;
					image1[idx + 2] = value;
					image1[idx + 3] = 255;

					image2[idx] = value;
					image2[idx + 1] = value;
					image2[idx + 2] = value;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBe(1.0); // Same edges = identical
		});

		it("should detect vertical edges", () => {
			const width = 20;
			const height = 20;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Image with vertical edge in the middle
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = x < width / 2 ? 0 : 255;
					image1[idx] = value;
					image1[idx + 1] = value;
					image1[idx + 2] = value;
					image1[idx + 3] = 255;

					image2[idx] = value;
					image2[idx + 1] = value;
					image2[idx + 2] = value;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBe(1.0); // Same edges = identical
		});
	});

	describe("Gradient Magnitude Similarity (GMS) Formula Verification", () => {
		it("should compute GMS correctly according to the formula", () => {
			// Test the mathematical correctness of GMS
			// GMS(x, y) = (2 * GM(x) * GM(y) + C) / (GM(x)² + GM(y)² + C)
			// When gradients are equal: GMS = (2 * GM² + C) / (2 * GM² + C) = 1

			const width = 50;
			const height = 50;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create identical checkerboard pattern (strong gradients)
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = (Math.floor(x / 5) + Math.floor(y / 5)) % 2 ? 255 : 0;

					image1[idx] = value;
					image1[idx + 1] = value;
					image1[idx + 2] = value;
					image1[idx + 3] = 255;

					image2[idx] = value;
					image2[idx + 1] = value;
					image2[idx + 2] = value;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			// When all GMS values are 1 (perfect match), stddev = 0, so GMSD score = 1 - 0 = 1
			expect(score).toBe(1.0);
		});
	});

	describe("Standard Deviation Computation", () => {
		it("should return score = 1 when all GMS values are identical (stddev = 0)", () => {
			// Uniform images have uniform gradients, leading to uniform GMS values
			const width = 50;
			const height = 50;
			const uniform = new Uint8Array(width * height * 4).fill(128);

			const score = gmsd(uniform, uniform, undefined, width, height, {});

			// Flat images → zero gradients → GMS all equal → stddev = 0 → score = 1
			expect(score).toBe(1.0);
		});

		it("should return score < 1 when GMS values vary (stddev > 0)", () => {
			const width = 50;
			const height = 50;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create VARYING gradient magnitudes (not uniform)
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;

					// Image 1: radial gradient (varying magnitude)
					const dx1 = x - width / 2;
					const dy1 = y - height / 2;
					const dist1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
					const value1 = Math.min(255, Math.floor(dist1 * 3));

					image1[idx] = value1;
					image1[idx + 1] = value1;
					image1[idx + 2] = value1;
					image1[idx + 3] = 255;

					// Image 2: slightly different radial gradient
					const dx2 = x - width / 2 + 5;
					const dy2 = y - height / 2 + 5;
					const dist2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
					const value2 = Math.min(255, Math.floor(dist2 * 3));

					image2[idx] = value2;
					image2[idx + 1] = value2;
					image2[idx + 2] = value2;
					image2[idx + 3] = 255;
				}
			}

			const score = gmsd(image1, image2, undefined, width, height, {});

			// Different gradient patterns → varying GMS → stddev > 0 → score < 1
			expect(score).toBeLessThan(1.0);
			expect(score).toBeGreaterThan(0);
		});
	});

	describe("Edge Cases", () => {
		it("should handle minimum size images (3x3)", () => {
			const width = 3;
			const height = 3;
			const image = new Uint8Array(width * height * 4).fill(128);

			const score = gmsd(image, image, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should handle all-black images", () => {
			const width = 50;
			const height = 50;
			const black = new Uint8Array(width * height * 4); // All zeros

			const score = gmsd(black, black, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should handle all-white images", () => {
			const width = 50;
			const height = 50;
			const white = new Uint8Array(width * height * 4).fill(255);

			const score = gmsd(white, white, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should clamp score to [0, 1] range", () => {
			const width = 50;
			const height = 50;
			const image1 = new Uint8Array(width * height * 4);
			const image2 = new Uint8Array(width * height * 4);

			// Create any different images
			image1.fill(0);
			image2.fill(255);

			const score = gmsd(image1, image2, undefined, width, height, {});

			expect(score).toBeGreaterThanOrEqual(0);
			expect(score).toBeLessThanOrEqual(1);
		});
	});

	describe("Constant C parameter", () => {
		it("should work with default c value (140)", () => {
			const width = 50;
			const height = 50;
			const image = new Uint8Array(width * height * 4).fill(128);

			const score = gmsd(image, image, undefined, width, height, {});

			expect(score).toBe(1.0);
		});

		it("should work with custom c value", () => {
			const width = 50;
			const height = 50;
			const image = new Uint8Array(width * height * 4).fill(128);

			const score = gmsd(image, image, undefined, width, height, { c: 100 });

			expect(score).toBe(1.0);
		});

		it("should produce similar results with different c values for identical images", () => {
			const width = 50;
			const height = 50;
			const image = new Uint8Array(width * height * 4).fill(128);

			const score1 = gmsd(image, image, undefined, width, height, { c: 100 });
			const score2 = gmsd(image, image, undefined, width, height, { c: 200 });

			expect(score1).toBe(1.0);
			expect(score2).toBe(1.0);
		});
	});

	describe("GMS Map Output", () => {
		it("should fill output buffer with GMS map when provided", () => {
			const width = 50;
			const height = 50;

			// Image 1: Vertical gradient
			const image1 = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = Math.floor((x / width) * 255);
					image1[idx] = value;
					image1[idx + 1] = value;
					image1[idx + 2] = value;
					image1[idx + 3] = 255;
				}
			}

			// Image 2: Similar but slightly different gradient
			const image2 = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = Math.floor((x / width) * 200);
					image2[idx] = value;
					image2[idx + 1] = value;
					image2[idx + 2] = value;
					image2[idx + 3] = 255;
				}
			}

			const output = new Uint8ClampedArray(width * height * 4);
			const score = gmsd(image1, image2, output, width, height, {});

			// Output should be filled with GMS values
			expect(output.length).toBe(width * height * 4);

			// Border pixels should be black (no gradient computation)
			expect(output[0]).toBe(0); // Top-left R
			expect(output[1]).toBe(0); // Top-left G
			expect(output[2]).toBe(0); // Top-left B
			expect(output[3]).toBe(0); // Top-left A

			// Interior pixels should have non-zero values (gradient similarity)
			const centerIdx = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
			expect(output[centerIdx]).toBeGreaterThan(0); // R
			expect(output[centerIdx + 1]).toBeGreaterThan(0); // G
			expect(output[centerIdx + 2]).toBeGreaterThan(0); // B
			expect(output[centerIdx + 3]).toBe(255); // Alpha should be 255

			// All RGB values should be the same (grayscale)
			expect(output[centerIdx]).toBe(output[centerIdx + 1]);
			expect(output[centerIdx + 1]).toBe(output[centerIdx + 2]);

			// Score should still be computed correctly
			expect(score).toBeGreaterThan(0);
			expect(score).toBeLessThanOrEqual(1);
		});

		it("should produce white GMS map for identical images", () => {
			const width = 20;
			const height = 20;

			// Create image with gradient pattern
			const image = new Uint8ClampedArray(width * height * 4);
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const value = Math.floor((x + y) * 2);
					image[idx] = value;
					image[idx + 1] = value;
					image[idx + 2] = value;
					image[idx + 3] = 255;
				}
			}

			const output = new Uint8ClampedArray(width * height * 4);
			const score = gmsd(image, image, output, width, height, {});

			// Score should be 1.0 for identical images
			expect(score).toBe(1.0);

			// Interior pixels should all be white (255) since GMS = 1.0 everywhere
			const centerIdx = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
			expect(output[centerIdx]).toBe(255); // R
			expect(output[centerIdx + 1]).toBe(255); // G
			expect(output[centerIdx + 2]).toBe(255); // B
			expect(output[centerIdx + 3]).toBe(255); // A
		});

		it("should work without output buffer (undefined)", () => {
			const width = 20;
			const height = 20;

			const image1 = new Uint8ClampedArray(width * height * 4);
			const image2 = new Uint8ClampedArray(width * height * 4);

			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					image1[idx] = x * 5;
					image1[idx + 1] = x * 5;
					image1[idx + 2] = x * 5;
					image1[idx + 3] = 255;

					image2[idx] = y * 5;
					image2[idx + 1] = y * 5;
					image2[idx + 2] = y * 5;
					image2[idx + 3] = 255;
				}
			}

			// Should not throw when output is undefined
			expect(() => {
				const score = gmsd(image1, image2, undefined, width, height, {});
				expect(score).toBeGreaterThanOrEqual(0);
				expect(score).toBeLessThanOrEqual(1);
			}).not.toThrow();
		});
	});
});
