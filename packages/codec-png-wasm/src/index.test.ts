import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { afterAll, describe, expect, it } from "vitest";
import { codecPngWasm, decode, encode } from "./index";

const FIXTURES = join(__dirname, "../../../fixtures");
const RGBA = join(FIXTURES, "blazediff/1a.png");
const RGB = join(FIXTURES, "pixelmatch/4a.png");
const PALETTE = join(FIXTURES, "pixelmatch/2a.png");

const scratch = mkdtempSync(join(tmpdir(), "blazediff-codec-png-wasm-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function pngjs(file: string) {
	const png = PNG.sync.read(readFileSync(file));
	return { data: png.data, width: png.width, height: png.height };
}

describe("codec-png-wasm", () => {
	it.each([RGBA, RGB, PALETTE])("decodes %s like pngjs", async (file) => {
		const ours = await decode(readFileSync(file));
		const reference = pngjs(file);
		expect(ours.width).toBe(reference.width);
		expect(ours.height).toBe(reference.height);
		expect(Buffer.compare(Buffer.from(ours.data), reference.data)).toBe(0);
	});

	it.each([
		{},
		{ compression: 0, filter: "none" as const },
		{ compression: 9, filter: "paeth" as const },
		{ compression: 0, filter: "none" as const, color: "rgba8" as const },
	])("round-trips through encode %o", async (options) => {
		const image = await decode(readFileSync(RGBA));
		const back = await decode(await encode(image, options));
		expect(back.width).toBe(image.width);
		expect(
			Buffer.compare(Buffer.from(back.data), Buffer.from(image.data)),
		).toBe(0);
	});

	it("reads and writes files through the codec interface", async () => {
		const image = await codecPngWasm.read(RGBA);
		const out = join(scratch, "out.png");
		await codecPngWasm.write(image, out);
		expect(pngjs(out).data.equals(Buffer.from(image.data))).toBe(true);
	});

	it("rejects bad input", async () => {
		await expect(decode(new Uint8Array([1, 2, 3]))).rejects.toThrow(
			/decode PNG/,
		);
		const image = { data: new Uint8Array(4), width: 1, height: 1 };
		await expect(encode(image, { compression: 13 })).rejects.toThrow(/0-12/);
		await expect(encode({ ...image, width: 2 })).rejects.toThrow(/encode PNG/);
	});
});
