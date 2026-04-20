import { assertEquals } from "jsr:@std/assert";
import { codecJsquashPng } from "./index.ts";

Deno.test("codec-jsquash-png: exposes read/write", () => {
	assertEquals(typeof codecJsquashPng.read, "function");
	assertEquals(typeof codecJsquashPng.write, "function");
});
