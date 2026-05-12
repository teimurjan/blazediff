import { describe, expect, it } from "vitest";
import {
	parsePort,
	parsePositiveInteger,
	parseThreshold,
	parseViewport,
	parseWaitFor,
} from "../../src/cli/parsers";

describe("parseViewport", () => {
	it("parses valid viewport strings", () => {
		expect(parseViewport("1280x800")).toEqual({ width: 1280, height: 800 });
	});

	it("rejects invalid viewport strings", () => {
		expect(() => parseViewport("1280")).toThrow(/invalid viewport/);
		expect(() => parseViewport("0x800")).toThrow(/invalid viewport/);
	});
});

describe("parsePositiveInteger", () => {
	it("accepts positive integers", () => {
		expect(parsePositiveInteger("3", "--concurrency")).toBe(3);
	});

	it("rejects zero, negatives, and NaN", () => {
		expect(() => parsePositiveInteger("0", "--concurrency")).toThrow(
			/invalid --concurrency/,
		);
		expect(() => parsePositiveInteger("-1", "--concurrency")).toThrow(
			/invalid --concurrency/,
		);
		expect(() => parsePositiveInteger("abc", "--concurrency")).toThrow(
			/invalid --concurrency/,
		);
	});
});

describe("parsePort", () => {
	it("accepts valid port numbers", () => {
		expect(parsePort("3000")).toBe(3000);
	});

	it("rejects out-of-range ports", () => {
		expect(() => parsePort("65536")).toThrow(/expected integer <= 65535/);
	});
});

describe("parseThreshold", () => {
	it("accepts thresholds in range", () => {
		expect(parseThreshold("0")).toBe(0);
		expect(parseThreshold("0.1")).toBe(0.1);
		expect(parseThreshold("1")).toBe(1);
	});

	it("rejects thresholds outside range", () => {
		expect(() => parseThreshold("-0.1")).toThrow(/expected number 0-1/);
		expect(() => parseThreshold("1.1")).toThrow(/expected number 0-1/);
		expect(() => parseThreshold("NaN")).toThrow(/expected number 0-1/);
	});
});

describe("parseWaitFor", () => {
	it("preserves built-in tokens and converts selectors", () => {
		expect(parseWaitFor("networkidle,fonts,.ready")).toEqual([
			"networkidle",
			"fonts",
			{ selector: ".ready" },
		]);
	});
});
