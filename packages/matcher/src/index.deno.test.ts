import { assertEquals } from "jsr:@std/assert";
import {
	fileExists,
	isFilePath,
	isImageBuffer,
	isImageData,
	isRawPngBuffer,
} from "./index.ts";

Deno.test("matcher: isFilePath discriminates strings from image objects", () => {
	assertEquals(isFilePath("/tmp/x.png"), true);
	assertEquals(
		isFilePath({ data: new Uint8Array(4), width: 1, height: 1 }),
		false,
	);
});

Deno.test("matcher: isImageData detects {data,width,height} shape", () => {
	assertEquals(
		isImageData({ data: new Uint8Array(4), width: 1, height: 1 }),
		true,
	);
	assertEquals(isImageData("/tmp/x.png"), false);
});

Deno.test("matcher: isImageBuffer / isRawPngBuffer on a Uint8Array", () => {
	const buf = new Uint8Array(16);
	assertEquals(typeof isImageBuffer(buf), "boolean");
	assertEquals(typeof isRawPngBuffer(buf), "boolean");
});

Deno.test("matcher: fileExists is false for a missing path", () => {
	assertEquals(fileExists("/definitely/not/a/real/path.png"), false);
});
