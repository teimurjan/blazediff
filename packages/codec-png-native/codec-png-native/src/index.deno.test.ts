import { assertEquals } from "jsr:@std/assert";
import { codecPngNative, decode, encode, hasNativeBinding } from "./index.ts";

Deno.test("codec-png-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("codec-png-native: every entry point is a function", () => {
	for (const fn of [
		decode,
		encode,
		codecPngNative.read,
		codecPngNative.write,
	]) {
		assertEquals(typeof fn, "function");
	}
});
