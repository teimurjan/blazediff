import { assertEquals, assertGreater } from "jsr:@std/assert";
import { type GmsdResult, gmsd, type Image } from "./index.ts";

const WIDTH = 8;
const HEIGHT = 8;

function gradientImage(): Image {
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
	return { data: buf, width: WIDTH, height: HEIGHT };
}

function noiseImage(seed: number): Image {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	let s = seed;
	for (let i = 0; i < WIDTH * HEIGHT; i++) {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		buf[i * 4] = s & 0xff;
		buf[i * 4 + 1] = (s >> 8) & 0xff;
		buf[i * 4 + 2] = (s >> 16) & 0xff;
		buf[i * 4 + 3] = 255;
	}
	return { data: buf, width: WIDTH, height: HEIGHT };
}

function scoreOf(result: GmsdResult): number {
	if (result.kind !== "compared") throw new Error("Image sizes differ");
	return result.score;
}

Deno.test("gmsd: identical images score 0", () => {
	const img = gradientImage();
	assertEquals(scoreOf(gmsd(img, { ...img, data: img.data.slice() })), 0);
});

Deno.test("gmsd: different images score > 0", () => {
	const a = gradientImage();
	const b = noiseImage(42);
	assertGreater(scoreOf(gmsd(a, b)), 0);
});

Deno.test("gmsd: different sizes report a dimension mismatch", () => {
	const small = { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 };
	assertEquals(gmsd(gradientImage(), small).kind, "dimension-mismatch");
});
