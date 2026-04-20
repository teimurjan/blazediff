import { assertEquals } from "jsr:@std/assert";
import { codecPngjs } from "./index.ts";

const WIDTH = 4;
const HEIGHT = 4;

function makePixels(): Uint8Array {
	const buf = new Uint8Array(WIDTH * HEIGHT * 4);
	for (let i = 0; i < WIDTH * HEIGHT; i++) {
		buf[i * 4] = (i * 16) & 0xff;
		buf[i * 4 + 1] = (i * 32) & 0xff;
		buf[i * 4 + 2] = (i * 64) & 0xff;
		buf[i * 4 + 3] = 255;
	}
	return buf;
}

Deno.test("codec-pngjs: write → read round-trip", async () => {
	const path = await Deno.makeTempFile({ suffix: ".png" });
	try {
		await codecPngjs.write(
			{ data: makePixels(), width: WIDTH, height: HEIGHT },
			path,
		);
		const image = await codecPngjs.read(path);
		assertEquals(image.width, WIDTH);
		assertEquals(image.height, HEIGHT);
		assertEquals(image.data.length, WIDTH * HEIGHT * 4);
	} finally {
		await Deno.remove(path);
	}
});
