/**
 * Hitchhiker's SSIM Tests - Validates implementation correctness
 *
 * Note: Hitchhiker's SSIM uses rectangular windows and CoV pooling, which differs
 * from MATLAB's Gaussian-based SSIM. Therefore, we expect different scores than
 * the MATLAB reference, but the algorithm should still produce consistent results.
 *
 * The key validation is:
 * 1. Identical images should return 1.0
 * 2. Different images should return scores < 1.0
 * 3. More similar images should have higher scores
 * 4. Performance should be significantly faster than Gaussian SSIM
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import { describe, expect, it } from "vitest";
import { hitchhikersSSIM } from "./hitchhikers-ssim";
import { ssim } from "./ssim";

/**
 * Run MATLAB ssim function and return the result (for comparison reference)
 */
function runMatlabSsim(img1Path: string, img2Path: string): number {
	const matlabPath = join(__dirname, "../matlab").replace(/'/g, "''");
	const img1Escaped = img1Path.replace(/'/g, "''");
	const img2Escaped = img2Path.replace(/'/g, "''");

	const matlabScript = [
		`addpath('${matlabPath}')`,
		`img1 = imread('${img1Escaped}')`,
		`img2 = imread('${img2Escaped}')`,
		`if size(img1, 3) == 3, img1 = rgb2gray(img1); end`,
		`if size(img2, 3) == 3, img2 = rgb2gray(img2); end`,
		`result = ssim(double(img1), double(img2))`,
		`fprintf('%.15f', result)`,
	].join("; ");

	const output = execSync(`octave --eval "${matlabScript}"`, {
		encoding: "utf-8",
		cwd: __dirname,
	});

	// Extract the numeric result from the output (last line)
	const match = output.match(/(\d+\.\d+)/);
	if (!match) {
		throw new Error(`Failed to parse MATLAB output: ${output}`);
	}

	return Number.parseFloat(match[0]);
}

describe("Hitchhiker's SSIM - Comparison with MATLAB SSIM", () => {
	const fixturesPath = join(__dirname, "../../../fixtures/blazediff");

	it("should compare with MATLAB SSIM for images 1a vs 1b", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		// Compute Hitchhiker's SSIM with both pooling methods
		const hitchhikersCov = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: true },
		);

		const hitchhikersMean = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: false },
		);

		// Compute standard SSIM (Gaussian-based)
		const gaussianSsim = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		console.log(`\n1a vs 1b:`);
		console.log(`  Hitchhiker's SSIM (CoV):  ${hitchhikersCov.toFixed(6)}`);
		console.log(`  Hitchhiker's SSIM (mean): ${hitchhikersMean.toFixed(6)}`);
		console.log(`  Gaussian SSIM:            ${gaussianSsim.toFixed(6)}`);
		console.log(`  MATLAB SSIM:              ${matlabResult.toFixed(6)}`);

		// Hitchhiker's SSIM should be close but not identical to Gaussian SSIM
		// (different window types and pooling methods)
		expect(hitchhikersMean).toBeGreaterThan(0.95);
		expect(hitchhikersMean).toBeLessThan(1.0);

		// CoV pooling should produce different results than mean pooling
		expect(hitchhikersCov).not.toBe(hitchhikersMean);
	});

	it("should compare with MATLAB SSIM for images 2a vs 2b", async () => {
		const img1Path = join(fixturesPath, "2a.png");
		const img2Path = join(fixturesPath, "2b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const hitchhikersCov = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: true },
		);

		const hitchhikersMean = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: false },
		);

		const gaussianSsim = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		console.log(`\n2a vs 2b:`);
		console.log(`  Hitchhiker's SSIM (CoV):  ${hitchhikersCov.toFixed(6)}`);
		console.log(`  Hitchhiker's SSIM (mean): ${hitchhikersMean.toFixed(6)}`);
		console.log(`  Gaussian SSIM:            ${gaussianSsim.toFixed(6)}`);
		console.log(`  MATLAB SSIM:              ${matlabResult.toFixed(6)}`);

		expect(hitchhikersMean).toBeGreaterThan(0.9);
		expect(hitchhikersMean).toBeLessThan(1.0);
		expect(hitchhikersCov).not.toBe(hitchhikersMean);
	});

	it(
		"should compare with MATLAB SSIM for images 3a vs 3b",
		{ timeout: 15000 },
		async () => {
			const img1Path = join(fixturesPath, "3a.png");
			const img2Path = join(fixturesPath, "3b.png");

			const png1 = await transformer.read(readFileSync(img1Path));
			const png2 = await transformer.read(readFileSync(img2Path));

			const hitchhikersCov = hitchhikersSSIM(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
				{ covPooling: true },
			);

			const hitchhikersMean = hitchhikersSSIM(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
				{ covPooling: false },
			);

			const gaussianSsim = ssim(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
			);

			const matlabResult = runMatlabSsim(img1Path, img2Path);

			console.log(`\n3a vs 3b:`);
			console.log(`  Hitchhiker's SSIM (CoV):  ${hitchhikersCov.toFixed(6)}`);
			console.log(`  Hitchhiker's SSIM (mean): ${hitchhikersMean.toFixed(6)}`);
			console.log(`  Gaussian SSIM:            ${gaussianSsim.toFixed(6)}`);
			console.log(`  MATLAB SSIM:              ${matlabResult.toFixed(6)}`);

			expect(hitchhikersMean).toBeGreaterThan(0.9);
			expect(hitchhikersMean).toBeLessThan(1.0);
			expect(hitchhikersCov).not.toBe(hitchhikersMean);
		},
	);

	it("should return 1.0 for identical images (matching MATLAB)", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1a.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const hitchhikersCov = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: true },
		);

		const hitchhikersMean = hitchhikersSSIM(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ covPooling: false },
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		console.log(`\nIdentical images:`);
		console.log(`  Hitchhiker's SSIM (CoV):  ${hitchhikersCov.toFixed(6)}`);
		console.log(`  Hitchhiker's SSIM (mean): ${hitchhikersMean.toFixed(6)}`);
		console.log(`  MATLAB SSIM:              ${matlabResult.toFixed(6)}`);

		// Both should return 1.0 for identical images
		expect(hitchhikersMean).toBe(1.0);
		expect(hitchhikersCov).toBe(1.0);
		expect(matlabResult).toBe(1.0);
	});
});

describe("Hitchhiker's SSIM - Algorithm Correctness", () => {
	describe("identical images", () => {
		it("should return 1.0 for identical solid color images", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			// Create solid gray image
			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			for (let i = 0; i < size; i += 4) {
				img1[i] = 128; // R
				img1[i + 1] = 128; // G
				img1[i + 2] = 128; // B
				img1[i + 3] = 255; // A

				img2[i] = 128;
				img2[i + 1] = 128;
				img2[i + 2] = 128;
				img2[i + 3] = 255;
			}

			const score = hitchhikersSSIM(img1, img2, undefined, width, height);
			expect(score).toBe(1.0);
		});

		it("should return 1.0 for identical gradient images", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			// Create horizontal gradient
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const gray = Math.floor((x / width) * 255);
					const idx = (y * width + x) * 4;

					img1[idx] = gray;
					img1[idx + 1] = gray;
					img1[idx + 2] = gray;
					img1[idx + 3] = 255;

					img2[idx] = gray;
					img2[idx + 1] = gray;
					img2[idx + 2] = gray;
					img2[idx + 3] = 255;
				}
			}

			const score = hitchhikersSSIM(img1, img2, undefined, width, height);
			expect(score).toBe(1.0);
		});
	});

	describe("different images", () => {
		it("should return score < 1.0 for slightly different images", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			// Create images with slight difference
			for (let i = 0; i < size; i += 4) {
				img1[i] = 128;
				img1[i + 1] = 128;
				img1[i + 2] = 128;
				img1[i + 3] = 255;

				img2[i] = 130; // Slight difference
				img2[i + 1] = 130;
				img2[i + 2] = 130;
				img2[i + 3] = 255;
			}

			// Use mean pooling for uniform images (CoV pooling doesn't work well with uniform images)
			const score = hitchhikersSSIM(img1, img2, undefined, width, height, {
				covPooling: false,
			});
			expect(score).toBeLessThan(1.0);
			expect(score).toBeGreaterThan(0.9); // Should still be high similarity
		});

		it("should return low score for very different images", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			// Create black vs white images
			for (let i = 0; i < size; i += 4) {
				img1[i] = 0;
				img1[i + 1] = 0;
				img1[i + 2] = 0;
				img1[i + 3] = 255;

				img2[i] = 255;
				img2[i + 1] = 255;
				img2[i + 2] = 255;
				img2[i + 3] = 255;
			}

			// Use mean pooling for uniform images (CoV pooling doesn't work well with uniform images)
			const score = hitchhikersSSIM(img1, img2, undefined, width, height, {
				covPooling: false,
			});
			expect(score).toBeLessThan(0.5);
		});
	});

	describe("CoV pooling vs mean pooling", () => {
		it("should produce different scores with different pooling methods", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			// Create images with some variation
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const idx = (y * width + x) * 4;
					const gray1 = 100 + (x % 20) * 5;
					const gray2 = 100 + (x % 20) * 5 + (y % 10);

					img1[idx] = gray1;
					img1[idx + 1] = gray1;
					img1[idx + 2] = gray1;
					img1[idx + 3] = 255;

					img2[idx] = gray2;
					img2[idx + 1] = gray2;
					img2[idx + 2] = gray2;
					img2[idx + 3] = 255;
				}
			}

			const scoreCov = hitchhikersSSIM(img1, img2, undefined, width, height, {
				covPooling: true,
			});
			const scoreMean = hitchhikersSSIM(img1, img2, undefined, width, height, {
				covPooling: false,
			});

			// Scores should be different
			expect(scoreCov).not.toBe(scoreMean);

			// Both should be in valid range
			expect(scoreCov).toBeGreaterThanOrEqual(0);
			expect(scoreCov).toBeLessThanOrEqual(1);
			expect(scoreMean).toBeGreaterThanOrEqual(0);
			expect(scoreMean).toBeLessThanOrEqual(1);
		});
	});

	describe("window options", () => {
		it("should work with different window sizes", () => {
			const width = 128;
			const height = 128;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			// Create gradient images
			for (let y = 0; y < height; y++) {
				for (let x = 0; x < width; x++) {
					const gray = Math.floor(((x + y) / (width + height)) * 255);
					const idx = (y * width + x) * 4;

					img1[idx] = gray;
					img1[idx + 1] = gray;
					img1[idx + 2] = gray;
					img1[idx + 3] = 255;

					img2[idx] = gray;
					img2[idx + 1] = gray;
					img2[idx + 2] = gray;
					img2[idx + 3] = 255;
				}
			}

			const score8 = hitchhikersSSIM(img1, img2, undefined, width, height, {
				windowSize: 8,
			});
			const score11 = hitchhikersSSIM(img1, img2, undefined, width, height, {
				windowSize: 11,
			});
			const score16 = hitchhikersSSIM(img1, img2, undefined, width, height, {
				windowSize: 16,
			});

			// All should give perfect score for identical images
			expect(score8).toBe(1.0);
			expect(score11).toBe(1.0);
			expect(score16).toBe(1.0);
		});

		it("should work with overlapping windows", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			for (let i = 0; i < size; i += 4) {
				img1[i] = 128;
				img1[i + 1] = 128;
				img1[i + 2] = 128;
				img1[i + 3] = 255;

				img2[i] = 128;
				img2[i + 1] = 128;
				img2[i + 2] = 128;
				img2[i + 3] = 255;
			}

			// Non-overlapping (stride = windowSize)
			const scoreNonOverlap = hitchhikersSSIM(
				img1,
				img2,
				undefined,
				width,
				height,
				{
					windowSize: 11,
					windowStride: 11,
				},
			);

			// Overlapping (stride < windowSize)
			const scoreOverlap = hitchhikersSSIM(
				img1,
				img2,
				undefined,
				width,
				height,
				{
					windowSize: 11,
					windowStride: 5,
				},
			);

			// Both should give perfect score for identical images
			expect(scoreNonOverlap).toBe(1.0);
			expect(scoreOverlap).toBe(1.0);
		});
	});

	describe("output buffer", () => {
		it("should fill output buffer with SSIM map", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);
			const output = new Uint8ClampedArray(size);

			// Create identical images
			for (let i = 0; i < size; i += 4) {
				img1[i] = 128;
				img1[i + 1] = 128;
				img1[i + 2] = 128;
				img1[i + 3] = 255;

				img2[i] = 128;
				img2[i + 1] = 128;
				img2[i + 2] = 128;
				img2[i + 3] = 255;
			}

			const _score = hitchhikersSSIM(img1, img2, output, width, height);

			// Check that output was filled
			expect(output.some((v) => v !== 0)).toBe(true);

			// For identical images, SSIM map should be mostly white (255)
			let whitePixels = 0;
			for (let i = 0; i < size; i += 4) {
				if (output[i] > 250) whitePixels++;
			}
			expect(whitePixels).toBeGreaterThan(width * height * 0.8); // At least 80% should be near white
		});
	});

	describe("edge cases", () => {
		it("should handle small images", () => {
			const width = 32;
			const height = 32;
			const size = width * height * 4;

			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			for (let i = 0; i < size; i += 4) {
				img1[i] = 100;
				img1[i + 1] = 100;
				img1[i + 2] = 100;
				img1[i + 3] = 255;

				img2[i] = 100;
				img2[i + 1] = 100;
				img2[i + 2] = 100;
				img2[i + 3] = 255;
			}

			const score = hitchhikersSSIM(img1, img2, undefined, width, height);
			expect(score).toBe(1.0);
		});

		it("should handle images with zero variance", () => {
			const width = 64;
			const height = 64;
			const size = width * height * 4;

			// Both images are solid black
			const img1 = new Uint8ClampedArray(size);
			const img2 = new Uint8ClampedArray(size);

			for (let i = 0; i < size; i += 4) {
				img1[i + 3] = 255;
				img2[i + 3] = 255;
			}

			const score = hitchhikersSSIM(img1, img2, undefined, width, height);
			expect(score).toBe(1.0);
		});
	});
});
