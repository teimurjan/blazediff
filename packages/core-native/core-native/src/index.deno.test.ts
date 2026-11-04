import { assertEquals } from "jsr:@std/assert";
import { diff, getBinaryPath, hasNativeBinding } from "./index.ts";

Deno.test("core-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("core-native: diff and getBinaryPath are functions", () => {
	assertEquals(typeof diff, "function");
	assertEquals(typeof getBinaryPath, "function");
});
