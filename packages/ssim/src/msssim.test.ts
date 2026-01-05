import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import { describe, expect, it } from "vitest";
import { msssim } from "./msssim";

/**
 * Run MATLAB msssim function and return the result
 */
function runMatlabMsssim(img1Path: string, img2Path: string): number {
	// Build MATLAB script as a single line with semicolons
	const matlabPath = join(__dirname, "../matlab").replace(/'/g, "''");
	const img1Escaped = img1Path.replace(/'/g, "''");
	const img2Escaped = img2Path.replace(/'/g, "''");

	const matlabScript = [
		`addpath('${matlabPath}')`,
		`img1 = imread('${img1Escaped}')`,
		`img2 = imread('${img2Escaped}')`,
		`if size(img1, 3) == 3, img1 = rgb2gray(img1); end`,
		`if size(img2, 3) == 3, img2 = rgb2gray(img2); end`,
		`result = msssim(double(img1), double(img2))`,
		`fprintf('%.10f', result)`,
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

describe("MS-SSIM - MATLAB Comparison", () => {
	const fixturesPath = join(__dirname, "../../../fixtures/blazediff");

	it("should match MATLAB for images 1a vs 1b", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		// Compute TypeScript MS-SSIM
		const tsResult = msssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabMsssim(img1Path, img2Path);

		const diff = Math.abs(tsResult - matlabResult);
		const diffPercent = (diff / matlabResult) * 100;
		console.log("\n1a vs 1b:");
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(10)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(10)}`);
		console.log(
			`  Diff:            ${diff.toFixed(10)} (${diffPercent.toFixed(2)}%)`,
		);

		expect(tsResult).toBeCloseTo(matlabResult, 1);
	});

	it("should match MATLAB for images 2a vs 2b", async () => {
		const img1Path = join(fixturesPath, "2a.png");
		const img2Path = join(fixturesPath, "2b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const tsResult = msssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabMsssim(img1Path, img2Path);

		const diff = Math.abs(tsResult - matlabResult);
		const diffPercent = (diff / matlabResult) * 100;
		console.log("\n2a vs 2b:");
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(10)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(10)}`);
		console.log(
			`  Diff:            ${diff.toFixed(10)} (${diffPercent.toFixed(2)}%)`,
		);

		expect(tsResult).toBeCloseTo(matlabResult, 1);
	});

	it(
		"should match MATLAB for images 3a vs 3b",
		{ timeout: 15000 },
		async () => {
			const img1Path = join(fixturesPath, "3a.png");
			const img2Path = join(fixturesPath, "3b.png");

			const png1 = await transformer.read(readFileSync(img1Path));
			const png2 = await transformer.read(readFileSync(img2Path));

			const tsResult = msssim(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
			);

			const matlabResult = runMatlabMsssim(img1Path, img2Path);

			const diff = Math.abs(tsResult - matlabResult);
			const diffPercent = (diff / matlabResult) * 100;
			console.log("\n3a vs 3b:");
			console.log(`  @blazediff/ssim: ${tsResult.toFixed(10)}`);
			console.log(`  MATLAB:          ${matlabResult.toFixed(10)}`);
			console.log(
				`  Diff:            ${diff.toFixed(10)} (${diffPercent.toFixed(2)}%)`,
			);

			expect(tsResult).toBeCloseTo(matlabResult, 1);
		},
	);

	it("should return 1.0 for identical images (matching MATLAB)", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1a.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const tsResult = msssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
		);

		const matlabResult = runMatlabMsssim(img1Path, img2Path);

		console.log("\nIdentical images:");
		console.log(`  @blazediff/ssim: ${tsResult.toFixed(6)}`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)}`);

		expect(tsResult).toBe(1.0);
		expect(matlabResult).toBe(1.0);
		expect(tsResult).toBe(matlabResult);
	});

	it("should generate SSIM map output", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const output = new Uint8ClampedArray(png1.width * png1.height * 4);
		const result = msssim(
			png1.data,
			png2.data,
			output,
			png1.width,
			png1.height,
		);

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

	it("should support weighted sum method", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const resultProduct = msssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ method: "product" },
		);

		const resultWtdSum = msssim(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{ method: "wtd_sum" },
		);

		// Both methods should return valid results
		expect(resultProduct).toBeGreaterThan(0.9);
		expect(resultProduct).toBeLessThan(1.0);
		expect(resultWtdSum).toBeGreaterThan(0.9);
		expect(resultWtdSum).toBeLessThan(1.0);

		// Results should be similar but not identical
		expect(Math.abs(resultProduct - resultWtdSum)).toBeLessThan(0.01);
	});
});
