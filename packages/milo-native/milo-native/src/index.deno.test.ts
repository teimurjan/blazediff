import { assertEquals } from "jsr:@std/assert";
import { compare, hasNativeBinding, milo, renderMap } from "./index.ts";

Deno.test("milo-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("milo-native: every entry point is a function", () => {
	for (const fn of [compare, milo, renderMap]) {
		assertEquals(typeof fn, "function");
	}
});
