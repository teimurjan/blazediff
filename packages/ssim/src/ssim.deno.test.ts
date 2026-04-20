import { assertAlmostEquals, assertLess } from "jsr:@std/assert";
import { hitchhikersSSIM } from "./hitchhikers-ssim.ts";
import { msssim } from "./msssim.ts";
import { ssim } from "./ssim.ts";

const WIDTH = 16;
const HEIGHT = 16;

function gradient(offset: number): Uint8Array {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	for (let i = 0; i < WIDTH * HEIGHT; i++) {
		const v = (i + offset) % 256;
		buf[i * 4] = v;
		buf[i * 4 + 1] = v;
		buf[i * 4 + 2] = v;
		buf[i * 4 + 3] = 255;
	}
	return buf;
}

Deno.test("ssim: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(
		ssim(img, img.slice(), undefined, WIDTH, HEIGHT),
		1.0,
		1e-6,
	);
});

Deno.test("ssim: very different images score < 1", () => {
	const a = gradient(0);
	const b = gradient(128);
	assertLess(ssim(a, b, undefined, WIDTH, HEIGHT), 1.0);
});

Deno.test("msssim: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(
		msssim(img, img.slice(), undefined, WIDTH, HEIGHT),
		1.0,
		1e-6,
	);
});

Deno.test("hitchhikersSSIM: identical images score 1.0", () => {
	const img = gradient(0);
	assertAlmostEquals(
		hitchhikersSSIM(img, img.slice(), undefined, WIDTH, HEIGHT),
		1.0,
		1e-6,
	);
});
