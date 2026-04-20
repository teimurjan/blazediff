import { assertEquals, assertGreater } from "jsr:@std/assert";
import { diff } from "./index.ts";

const WIDTH = 2;
const HEIGHT = 2;

function makeImage(pixels: number[]): Uint8Array {
	return new Uint8Array(pixels);
}

Deno.test("diff: identical 2×2 images return 0", () => {
	const pixels = [
		255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
	];
	const a = makeImage(pixels);
	const b = makeImage(pixels);
	assertEquals(diff(a, b, undefined, WIDTH, HEIGHT), 0);
});

Deno.test("diff: different images return a positive count", () => {
	const a = makeImage([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]);
	const b = makeImage([
		255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
		255,
	]);
	assertGreater(diff(a, b, undefined, WIDTH, HEIGHT), 0);
});
