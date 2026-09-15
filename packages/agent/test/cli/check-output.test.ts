import { describe, expect, it } from "vitest";
import { parseJudge, parseLocalModel } from "../../src/cli/check-output";

describe("parseJudge", () => {
	it("accepts every judge backend", () => {
		expect(parseJudge("agent")).toBe("agent");
		expect(parseJudge("none")).toBe("none");
		expect(parseJudge("local")).toBe("local");
	});

	it("maps pre-rename names onto their backends", () => {
		expect(parseJudge("host")).toBe("agent");
		expect(parseJudge("moondream")).toBe("local");
	});

	it("rejects unknown backends", () => {
		expect(() => parseJudge("gpt")).toThrow(/unknown --judge backend/);
	});
});

describe("parseLocalModel", () => {
	it("defaults to the in-process ONNX model", () => {
		expect(parseLocalModel("local", undefined)).toBe("moondream-2-2b-onnx");
	});

	it("accepts both local models", () => {
		expect(parseLocalModel("local", "moondream-2-2b-onnx")).toBe(
			"moondream-2-2b-onnx",
		);
		expect(parseLocalModel("local", "moondream-3-9b-mlx")).toBe(
			"moondream-3-9b-mlx",
		);
	});

	it("rejects a model on backends that run none", () => {
		expect(() => parseLocalModel("agent", "moondream-3-9b-mlx")).toThrow(
			/--model applies to --judge local/,
		);
		expect(() => parseLocalModel("none", "moondream-3-9b-mlx")).toThrow(
			/--model applies to --judge local/,
		);
	});

	it("rejects unknown models", () => {
		expect(() => parseLocalModel("local", "gpt-vision")).toThrow(
			/unknown --model/,
		);
	});
});
