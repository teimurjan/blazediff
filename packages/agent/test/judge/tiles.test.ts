import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prepareTiles } from "../../src/judge/tiles";
import type { RegionSummary } from "../../src/types";

const region: RegionSummary = {
	bbox: { x: 10, y: 10, width: 20, height: 20 },
	pixelCount: 400,
	percentage: 0.1,
	changeType: "addition",
	confidence: 1,
};

async function solidPng(file: string, rgb: [number, number, number]) {
	await sharp({
		create: {
			width: 64,
			height: 64,
			channels: 3,
			background: { r: rgb[0], g: rgb[1], b: rgb[2] },
		},
	})
		.png()
		.toFile(file);
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(tmpdir(), "bd-tiles-"));
	await Promise.all([
		solidPng(path.join(dir, "base.png"), [255, 255, 255]),
		solidPng(path.join(dir, "actual.png"), [0, 0, 0]),
		solidPng(path.join(dir, "diff.png"), [255, 0, 0]),
	]);
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe("prepareTiles", () => {
	it("builds region tiles without a diff PNG and skips the locator", async () => {
		const res = await prepareTiles({
			regions: [region],
			baselinePath: path.join(dir, "base.png"),
			actualPath: path.join(dir, "actual.png"),
			outputDir: dir,
		});
		expect(res.tilesPath).toBe("regions.png");
		expect(existsSync(path.join(dir, "regions.png"))).toBe(true);
		expect(res.locatorPath).toBeUndefined();
		expect(existsSync(path.join(dir, "locator.png"))).toBe(false);
	});

	it("renders the locator when a diff PNG is supplied", async () => {
		const res = await prepareTiles({
			regions: [region],
			baselinePath: path.join(dir, "base.png"),
			actualPath: path.join(dir, "actual.png"),
			diffPath: path.join(dir, "diff.png"),
			outputDir: dir,
		});
		expect(res.locatorPath).toBe("locator.png");
		expect(existsSync(path.join(dir, "locator.png"))).toBe(true);
	});
});
