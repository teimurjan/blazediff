import { assertEquals } from "jsr:@std/assert";
import { compare, getBinaryPath, hasNativeBinding } from "./index.ts";

Deno.test("core-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("core-native: compare and getBinaryPath are functions", () => {
	assertEquals(typeof compare, "function");
	assertEquals(typeof getBinaryPath, "function");
});
