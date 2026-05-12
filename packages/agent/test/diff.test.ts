import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diffEntry } from "../src/diff";

let tmp: string;
let baseline: string;
let actual: string;
let actualMatch: string;

async function solidPng(
	out: string,
	color: { r: number; g: number; b: number },
): Promise<void> {
	await sharp({
		create: {
			width: 16,
			height: 16,
			channels: 3,
			background: color,
		},
	})
		.png()
		.toFile(out);
}

beforeAll(async () => {
	tmp = await mkdtemp(path.join(tmpdir(), "blazediff-diff-test-"));
	baseline = path.join(tmp, "baseline.png");
	actual = path.join(tmp, "actual.png");
	actualMatch = path.join(tmp, "actual-match.png");
	await solidPng(baseline, { r: 255, g: 255, b: 255 });
	await solidPng(actual, { r: 0, g: 0, b: 0 });
	await solidPng(actualMatch, { r: 255, g: 255, b: 255 });
});

afterAll(async () => {
	if (tmp) await rm(tmp, { recursive: true, force: true });
});

describe("diffEntry", () => {
	it("returns match when images are identical", async () => {
		const result = await diffEntry(
			"test-match",
			baseline,
			actualMatch,
			{
				emitDiffPng: false,
			},
			tmp,
		);
		expect(result.match).toBe(true);
	});

	it("returns pixel-diff with interpretation when images differ", async () => {
		const result = await diffEntry(
			"test-diff",
			baseline,
			actual,
			{
				emitDiffPng: false,
			},
			tmp,
		);
		expect(result.match).toBe(false);
		expect(result.reason).toBe("pixel-diff");
		expect(result.diffPercentage).toBeGreaterThan(0);
		expect(result.interpretation).toBeDefined();
		expect(result.interpretation?.regions?.length ?? 0).toBeGreaterThan(0);
	});

	it("returns file-not-exists when baseline missing", async () => {
		const result = await diffEntry(
			"test-missing",
			path.join(tmp, "nonexistent.png"),
			actual,
			{ emitDiffPng: false },
			tmp,
		);
		expect(result.match).toBe(false);
		expect(result.reason).toBe("file-not-exists");
	});
});
