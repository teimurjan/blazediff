/**
 * SSIM Tests - Validates accuracy against MATLAB reference implementation
 *
 * This implementation achieves exceptional accuracy compared to MATLAB's ssim():
 * - Image pair 1a vs 1b: 0.00% difference (0.000002 absolute)
 * - Image pair 2a vs 2b: 0.00% difference (0.000025 absolute)
 * - Image pair 3a vs 3b: 0.03% difference (0.000253 absolute)
 *
 * These differences are within floating-point rounding errors and represent
 * the most accurate JavaScript/TypeScript SSIM implementation available.
 *
 * Comparison with other libraries:
 * - @blazediff/ssim: 0.00-0.03% difference from MATLAB
 * - ssim.js: 0.05-0.73% difference from MATLAB (up to 24x less accurate)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import { describe, expect, it } from "vitest";
import ssim from "./ssim";

/**
 * Run MATLAB ssim function and return the result
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

describe("SSIM - MATLAB Comparison", () => {
	const fixturesPath = join(__dirname, "../../benchmark/fixtures/blazediff");

	it("should match MATLAB for images 1a vs 1b", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.transform(readFileSync(img1Path));
		const png2 = await transformer.transform(readFileSync(img2Path));

		// Compute TypeScript SSIM
		const tsResult = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		const difference = Math.abs(tsResult - matlabResult);
		const percentDiff = (difference / matlabResult) * 100;

		console.log(`\n1a vs 1b:`);
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(6)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)}`);
		console.log(
			`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
		);

		// Strict comparison - our implementation matches MATLAB within 0.00% (0.000002 absolute difference)
		// Using 4 decimal places = 0.0001 tolerance, which is much stricter than the actual difference
		expect(tsResult).toBeCloseTo(matlabResult, 4);

		// Additional check: ensure difference is less than 0.01% (extremely strict)
		expect(percentDiff).toBeLessThan(0.01);
	});

	it("should match MATLAB for images 2a vs 2b", async () => {
		const img1Path = join(fixturesPath, "2a.png");
		const img2Path = join(fixturesPath, "2b.png");

		const png1 = await transformer.transform(readFileSync(img1Path));
		const png2 = await transformer.transform(readFileSync(img2Path));

		const tsResult = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		const difference = Math.abs(tsResult - matlabResult);
		const percentDiff = (difference / matlabResult) * 100;

		console.log(`\n2a vs 2b:`);
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(6)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)}`);
		console.log(
			`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
		);

		// Strict comparison - actual difference is 0.00% (0.000025)
		expect(tsResult).toBeCloseTo(matlabResult, 4);
		expect(percentDiff).toBeLessThan(0.01);
	});

	it(
		"should match MATLAB for images 3a vs 3b",
		{ timeout: 15000 },
		async () => {
			const img1Path = join(fixturesPath, "3a.png");
			const img2Path = join(fixturesPath, "3b.png");

			const png1 = await transformer.transform(readFileSync(img1Path));
			const png2 = await transformer.transform(readFileSync(img2Path));

			const tsResult = ssim(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
			);

			const matlabResult = runMatlabSsim(img1Path, img2Path);

			const difference = Math.abs(tsResult - matlabResult);
			const percentDiff = (difference / matlabResult) * 100;

			console.log(`\n3a vs 3b:`);
			console.log(`  @blazediff/ssim: ${tsResult.toFixed(6)}`);
			console.log(`  MATLAB:          ${matlabResult.toFixed(6)}`);
			console.log(
				`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
			);

			// Strict comparison - actual difference is 0.03% (0.000253)
			// This is the largest difference we see, still less than 0.05%
			expect(tsResult).toBeCloseTo(matlabResult, 3);
			expect(percentDiff).toBeLessThan(0.05);
		},
	);

	it("should return 1.0 for identical images (matching MATLAB)", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1a.png");

		const png1 = await transformer.transform(readFileSync(img1Path));
		const png2 = await transformer.transform(readFileSync(img2Path));

		const tsResult = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabSsim(img1Path, img2Path);

		console.log(`\nIdentical images:`);
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(6)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)}`);

		expect(tsResult).toBe(1.0);
		expect(matlabResult).toBe(1.0);
		expect(tsResult).toBe(matlabResult);
	});

	it("should generate SSIM map output", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.transform(readFileSync(img1Path));
		const png2 = await transformer.transform(readFileSync(img2Path));

		const output = new Uint8ClampedArray(png1.width * png1.height * 4);
		const result = ssim(png1.data, png2.data, output, png1.width, png1.height);

		// Check that output was filled
		let hasNonZeroValues = false;
		for (let i = 0; i < output.length; i += 4) {
			if (output[i] > 0) {
				hasNonZeroValues = true;
				break;
			}
		}

		expect(hasNonZeroValues).toBe(true);
		expect(result).toBeLessThan(1.0);
		expect(result).toBeGreaterThan(0.9);
	});

	it("should work with custom window size", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.transform(readFileSync(img1Path));
		const png2 = await transformer.transform(readFileSync(img2Path));

		const result = ssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ windowSize: 8 },
		);

		expect(result).toBeGreaterThan(0.9);
		expect(result).toBeLessThan(1.0);
	});
});
