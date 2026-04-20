import { assertEquals } from "jsr:@std/assert";
import { codecSharp } from "./index.ts";

Deno.test("codec-sharp: exposes read/write", () => {
	assertEquals(typeof codecSharp.read, "function");
	assertEquals(typeof codecSharp.write, "function");
});
