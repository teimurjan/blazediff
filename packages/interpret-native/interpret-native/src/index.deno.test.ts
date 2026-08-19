import { assertEquals } from "jsr:@std/assert";
import { hasNativeBinding, interpret, interpretRegions } from "./index.ts";

Deno.test("interpret-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("interpret-native: every entry point is a function", () => {
	for (const fn of [interpret, interpretRegions]) {
		assertEquals(typeof fn, "function");
	}
});
