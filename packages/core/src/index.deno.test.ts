import { assertEquals } from "jsr:@std/assert";
import { diff, type Image } from "./index.ts";
import pixelmatch from "./pixelmatch.ts";

function image(pixels: number[]): Image {
	return { data: new Uint8Array(pixels), width: 2, height: 2 };
}

const COLORS = image([
	255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
]);
const BLACK = image(Array.from({ length: 4 }, () => [0, 0, 0, 255]).flat());
const WHITE = image(new Array(16).fill(255));

Deno.test("diff: identical 2×2 images are identical", () => {
	assertEquals(diff(COLORS, image([...COLORS.data])), {
		kind: "compared",
		count: 0,
		percentage: 0,
		identical: true,
	});
});

Deno.test("diff: black vs white counts every pixel", () => {
	const result = diff(BLACK, WHITE);
	assertEquals(result.kind === "compared" && result.count, 4);
});

Deno.test("pixelmatch adapter: black vs white counts every pixel", () => {
	assertEquals(pixelmatch(BLACK.data, WHITE.data, null, 2, 2), 4);
});
