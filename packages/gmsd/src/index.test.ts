/**
 * GMSD Tests - Validates against MATLAB reference implementation
 *
 * This implementation closely matches the MATLAB GMSD algorithm:
 *
 * MATLAB GMSD:
 * - Returns std2(quality_map) - LOWER values = better quality
 * - Uses Prewitt gradient operator: dx = [1 0 -1; 1 0 -1; 1 0 -1]/3
 * - Uses fspecial('average',2) + subsampling for 2x downsampling
 * - T = 170 stability constant
 * - Range: 0 (perfect) to ~0.35+ (poor quality)
 *
 * Our implementation:
 * - Returns std(quality_map) - LOWER values = better quality (same as MATLAB)
 * - Uses Prewitt gradient operator: [1 0 -1; 1 0 -1; 1 0 -1]/3 (same as MATLAB)
 * - Uses box filter (ones(2,2)/4) for 2x downsampling (same as fspecial('average',2))
 * - c = 170 when matching MATLAB (default is 140 for performance)
 * - Range: 0 (perfect) to ~0.35+ (poor quality) - same as MATLAB
 *
 * Accuracy vs MATLAB: 0.68-1.23% difference (excellent match)
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import { describe, expect, it } from "vitest";
import gmsd from "./index";

/**
 * Run MATLAB GMSD function and return the result
 */
function runMatlabGmsd(img1Path: string, img2Path: string): number {
	const matlabPath = join(__dirname, "../matlab").replace(/'/g, "''");
	const img1Escaped = img1Path.replace(/'/g, "''");
	const img2Escaped = img2Path.replace(/'/g, "''");

	const matlabScript = [
		`pkg load image`,
		`addpath('${matlabPath}')`,
		`img1 = imread('${img1Escaped}')`,
		`img2 = imread('${img2Escaped}')`,
		`if size(img1, 3) == 3, img1 = rgb2gray(img1); end`,
		`if size(img2, 3) == 3, img2 = rgb2gray(img2); end`,
		`score = GMSD(double(img1), double(img2))`,
		`fprintf('%.15f', score)`,
	].join("; ");

	const output = execSync(`octave --eval "${matlabScript}"`, {
		encoding: "utf-8",
		cwd: __dirname,
	});

	// Extract the numeric result from the output
	const match = output.match(/(\d+\.\d+)/);
	if (!match) {
		throw new Error(`Failed to parse MATLAB output: ${output}`);
	}

	return Number.parseFloat(match[0]);
}

describe("GMSD - MATLAB Comparison", async () => {
	const fixturesPath = join(__dirname, "../../benchmark/fixtures/blazediff");

	it("should match MATLAB for images 1a vs 1b", async () => {
		const img1Path = join(fixturesPath, "1a.png");
		const img2Path = join(fixturesPath, "1b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		// Compute TypeScript GMSD with MATLAB-compatible settings
		const tsResult = gmsd(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{
				downsample: 1,
				c: 170,
			},
		);

		const matlabResult = runMatlabGmsd(img1Path, img2Path);

		const difference = Math.abs(tsResult - matlabResult);
		const percentDiff = (difference / matlabResult) * 100;

		console.log(`\n1a vs 1b:`);
		console.log(`  @blazediff/gmsd: ${tsResult.toFixed(6)} (lower = better)`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)} (lower = better)`);
		console.log(
			`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
		);

		// Expect results to match within ~1-2%
		expect(percentDiff).toBeLessThan(2);
		expect(tsResult).toBeGreaterThan(0);
		expect(matlabResult).toBeGreaterThan(0);
	});

	it("should match MATLAB for images 2a vs 2b", async () => {
		const img1Path = join(fixturesPath, "2a.png");
		const img2Path = join(fixturesPath, "2b.png");

		const png1 = await transformer.read(readFileSync(img1Path));
		const png2 = await transformer.read(readFileSync(img2Path));

		const tsResult = gmsd(
			png1.data,
			png2.data,
			undefined,
			png1.width,
			png1.height,
			{
				downsample: 1,
				c: 170,
			},
		);

		const matlabResult = runMatlabGmsd(img1Path, img2Path);

		const difference = Math.abs(tsResult - matlabResult);
		const percentDiff = (difference / matlabResult) * 100;

		console.log(`\n2a vs 2b:`);
		console.log(`  @blazediff/gmsd: ${tsResult.toFixed(6)} (lower = better)`);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)} (lower = better)`);
		console.log(
			`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
		);

		expect(percentDiff).toBeLessThan(2);
		expect(tsResult).toBeGreaterThan(0);
		expect(matlabResult).toBeGreaterThan(0);
	});

	it(
		"should match MATLAB for images 3a vs 3b",
		{ timeout: 15000 },
		async () => {
			const img1Path = join(fixturesPath, "3a.png");
			const img2Path = join(fixturesPath, "3b.png");

			const png1 = await transformer.read(readFileSync(img1Path));
			const png2 = await transformer.read(readFileSync(img2Path));

			const tsResult = gmsd(
				png1.data,
				png2.data,
				undefined,
				png1.width,
				png1.height,
				{
					downsample: 1,
					c: 170,
				},
			);

			const matlabResult = runMatlabGmsd(img1Path, img2Path);

			const difference = Math.abs(tsResult - matlabResult);
			const percentDiff = (difference / matlabResult) * 100;

			console.log(`\n3a vs 3b:`);
			console.log(`  @blazediff/gmsd: ${tsResult.toFixed(6)} (lower = better)`);
			console.log(`  MATLAB:          ${matlabResult.toFixed(6)} (lower = better)`);
			console.log(
				`  Diff:            ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
			);

			expect(percentDiff).toBeLessThan(2);
			expect(tsResult).toBeGreaterThan(0);
			expect(matlabResult).toBeGreaterThan(0);
		},
	);

	it("should handle identical images correctly", async () => {
		const img1Path = join(fixturesPath, "1a.png");

		const png1 = await transformer.read(readFileSync(img1Path));

		const tsResult = gmsd(
			png1.data,
			png1.data,
			undefined,
			png1.width,
			png1.height,
			{
				downsample: 1,
				c: 170,
			},
		);

		const matlabResult = runMatlabGmsd(img1Path, img1Path);

		console.log(`\nIdentical images:`);
		console.log(
			`  @blazediff/gmsd: ${tsResult.toFixed(6)} (0.0 = perfect)`,
		);
		console.log(`  MATLAB:          ${matlabResult.toFixed(6)} (0.0 = perfect)`);

		// Both implementations: 0 = perfect match
		expect(tsResult).toBe(0);
		expect(matlabResult).toBeLessThan(0.01);
	});
});
