import { assertAlmostEquals, assertEquals, assertLess } from "jsr:@std/assert";
import { hitchhikersSSIM } from "./hitchhikers-ssim.ts";
import { msssim } from "./msssim.ts";
import { ssim } from "./ssim.ts";
import { scoreOf } from "./test-helpers.ts";
import type { Image } from "./types.ts";

const WIDTH = 16;
const HEIGHT = 16;

function gradient(offset: number): Image {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	for (let i = 0; i < WIDTH * HEIGHT; i++) {
		const v = (i + offset) % 256;
		buf[i * 4] = v;
		buf[i * 4 + 1] = v;
		buf[i * 4 + 2] = v;
		buf[i * 4 + 3] = 255;
	}
	return { data: buf, width: WIDTH, height: HEIGHT };
}

function copy(image: Image): Image {
	return { ...image, data: image.data.slice() };
}

Deno.test("ssim: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(scoreOf(ssim(img, copy(img))), 1.0, 1e-6);
});

Deno.test("ssim: very different images score < 1", () => {
	const a = gradient(0);
	const b = gradient(128);
	assertLess(scoreOf(ssim(a, b)), 1.0);
});

Deno.test("msssim: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(scoreOf(msssim(img, copy(img))), 1.0, 1e-6);
});

Deno.test("hitchhikersSSIM: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(scoreOf(hitchhikersSSIM(img, copy(img))), 1.0, 1e-6);
});

Deno.test("ssim: different sizes report a dimension mismatch", () => {
	const small = { data: new Uint8Array(4 * 4 * 4), width: 4, height: 4 };
	assertEquals(ssim(gradient(0), small).kind, "dimension-mismatch");
});
