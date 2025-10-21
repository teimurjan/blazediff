/**
 * Test to compare ssim.js (external library) with MATLAB reference
 * This helps understand how much external implementations differ from the academic reference
 */

import { execSync } from "node:child_process";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import ssimjs from "ssim.js";
import { describe, expect, it } from "vitest";

const fixturesDir = join(__dirname, "../../benchmark/fixtures/blazediff");
const matlabPath = join(__dirname, "../matlab");

function runMatlabSsim(img1Path: string, img2Path: string): number {
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
		stdio: ["pipe", "pipe", "ignore"],
	});

	const match = output.match(/[\d.]+$/);
	if (!match) {
		throw new Error(`Failed to parse MATLAB output: ${output}`);
	}

	return parseFloat(match[0]);
}

describe("ssim.js vs MATLAB Comparison", () => {
	const testCases = [
		{ name: "1a vs 1b", img1: "1a.png", img2: "1b.png" },
		{ name: "2a vs 2b", img1: "2a.png", img2: "2b.png" },
		{ name: "3a vs 3b", img1: "3a.png", img2: "3b.png" },
	];

	for (const { name, img1, img2 } of testCases) {
		it(
			`should compare ssim.js with MATLAB for ${name}`,
			async () => {
				const img1Path = join(fixturesDir, img1);
				const img2Path = join(fixturesDir, img2);

				const [image1, image2] = await Promise.all([
					transformer.transform(img1Path),
					transformer.transform(img2Path),
				]);

				const imageData1 = {
					data: image1.data as Uint8ClampedArray,
					width: image1.width,
					height: image1.height,
				};

				const imageData2 = {
					data: image2.data as Uint8ClampedArray,
					width: image2.width,
					height: image2.height,
				};

				const ssimjsWeberResult = ssimjs(imageData1, imageData2, {
					ssim: "weber",
				});
				const ssimjsOriginalResult = ssimjs(imageData1, imageData2, {
					ssim: "original",
				});
				const ssimjsWeberScore = ssimjsWeberResult.mssim;
				const ssimjsOriginalScore = ssimjsOriginalResult.mssim;

				const matlabResult = runMatlabSsim(img1Path, img2Path);

				const difference = Math.abs(ssimjsWeberScore - matlabResult);
				const percentDiff = (difference / matlabResult) * 100;

				console.log(`\n${name}:`);
				console.log(`  ssim.js:  ${ssimjsWeberScore.toFixed(6)} (Weber)`);
				console.log(`  ssim.js:  ${ssimjsOriginalScore.toFixed(6)} (Original)`);
				console.log(`  MATLAB:   ${matlabResult.toFixed(6)}`);
				console.log(
					`  Diff:     ${difference.toFixed(6)} (${percentDiff.toFixed(2)}%)`,
				);

				expect(ssimjsWeberScore).toBeGreaterThan(0);
				expect(ssimjsOriginalScore).toBeGreaterThan(0);
				expect(matlabResult).toBeGreaterThan(0);
			},
			{ timeout: 15000 },
		);
	}

	it(
		"should return 1.0 for identical images",
		async () => {
			const img1Path = join(fixturesDir, "1a.png");

			const image1 = await transformer.transform(img1Path);

			const imageData1 = {
				data: image1.data as Uint8ClampedArray,
				width: image1.width,
				height: image1.height,
			};

			const ssimjsWeberResult = ssimjs(imageData1, imageData1, {
				ssim: "weber",
			});
			const ssimjsOriginalResult = ssimjs(imageData1, imageData1, {
				ssim: "original",
			});
			const ssimjsWeberScore = ssimjsWeberResult.mssim;
			const ssimjsOriginalScore = ssimjsOriginalResult.mssim;

			const matlabResult = runMatlabSsim(img1Path, img1Path);

			console.log(`\nIdentical images:`);
			console.log(`  ssim.js:  ${ssimjsWeberScore.toFixed(6)} (Weber)`);
			console.log(`  ssim.js:  ${ssimjsOriginalScore.toFixed(6)} (Original)`);
			console.log(`  MATLAB:   ${matlabResult.toFixed(6)}`);

			expect(ssimjsWeberScore).toBeCloseTo(1.0, 10);
			expect(ssimjsOriginalScore).toBeCloseTo(1.0, 10);
			expect(matlabResult).toBeCloseTo(1.0, 10);
		},
		{ timeout: 10000 },
	);
});
