import { assertEquals } from "jsr:@std/assert";
import {
	compare,
	hasNativeBinding,
	hitchhikersSsim,
	metrics,
	msSsim,
	perceptualSsim,
	renderMap,
	ssim,
} from "./index.ts";

Deno.test("ssim-native: hasNativeBinding returns a boolean", () => {
	assertEquals(typeof hasNativeBinding(), "boolean");
});

Deno.test("ssim-native: every entry point is a function", () => {
	for (const fn of [
		compare,
		ssim,
		msSsim,
		hitchhikersSsim,
		perceptualSsim,
		renderMap,
		metrics,
	]) {
		assertEquals(typeof fn, "function");
	}
});
