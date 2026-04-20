import { assertEquals } from "jsr:@std/assert";
import { compare, hasNativeBinding, interpret } from "./index.ts";

Deno.test("core-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("core-native: compare and interpret are functions", () => {
	assertEquals(typeof compare, "function");
	assertEquals(typeof interpret, "function");
});
