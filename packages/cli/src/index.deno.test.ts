import { assertEquals } from "jsr:@std/assert";
import type {
	ComparisonMode,
	DiffModeOptions,
	DiffModeResult,
} from "./index.ts";

Deno.test("cli: type module is importable", () => {
	const mode: ComparisonMode = "diff";
	assertEquals(mode, "diff");
});

Deno.test("cli: DiffModeResult / DiffModeOptions shapes compile", () => {
	const opts: DiffModeOptions = {
		codec: {
			read: async () => ({ data: new Uint8Array(4), width: 1, height: 1 }),
			write: async () => {},
		},
	};
	const result: DiffModeResult = {
		mode: "diff",
		diffCount: 0,
		width: 1,
		height: 1,
		duration: 0,
	};
	assertEquals(typeof opts.codec.read, "function");
	assertEquals(result.mode, "diff");
});
