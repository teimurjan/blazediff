import { assertEquals, assertGreater } from "jsr:@std/assert";
import { gmsd } from "./index.ts";

const WIDTH = 8;
const HEIGHT = 8;

function gradientImage(): Uint8Array {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			const i = (y * WIDTH + x) * 4;
			buf[i] = x * 32;
			buf[i + 1] = y * 32;
			buf[i + 2] = (x + y) * 16;
			buf[i + 3] = 255;
		}
	}
	return buf;
}

function noiseImage(seed: number): Uint8Array {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	let s = seed;
	for (let i = 0; i < WIDTH * HEIGHT; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		buf[i * 4] = s & 0xff;
		buf[i * 4 + 1] = (s >> 8) & 0xff;
		buf[i * 4 + 2] = (s >> 16) & 0xff;
		buf[i * 4 + 3] = 255;
	}
	return buf;
}

Deno.test("gmsd: identical images score 0", () => {
	const img = gradientImage();
	assertEquals(gmsd(img, img.slice(), undefined, WIDTH, HEIGHT), 0);
});

Deno.test("gmsd: different images score > 0", () => {
	const a = gradientImage();
	const b = noiseImage(42);
	assertGreater(gmsd(a, b, undefined, WIDTH, HEIGHT), 0);
});
