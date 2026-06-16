import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

// PNG.sync.read reaches into Node's private zlib `_handle`, which Deno (≥2.8)
// rejects with "expected typed ArrayBufferView". On Deno, fall back to the
// async streaming parser (public zlib API); keep the faster sync path on Node.
const isDeno = typeof (globalThis as { Deno?: unknown }).Deno !== "undefined";

function decode(buffer: Buffer): Promise<Image> {
	if (!isDeno) {
		const png = PNG.sync.read(buffer);
		return Promise.resolve({
			data: png.data,
			width: png.width,
			height: png.height,
		});
	}
	return new Promise((resolve, reject) => {
		new PNG().parse(buffer, (error, png) => {
			if (error) {
				reject(error);
				return;
			}
			resolve({ data: png.data, width: png.width, height: png.height });
		});
	});
}

async function read(input: string | Buffer): Promise<Image> {
	try {
		const buffer = typeof input === "string" ? readFileSync(input) : input;
		return await decode(buffer);
	} catch (error) {
		throw new Error(`Failed to read PNG file ${input}: ${error}`);
	}
}

async function write(image: Image, output: string | Buffer): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const png = new PNG({ width: image.width, height: image.height });
			png.data = Buffer.isBuffer(image.data)
				? image.data
				: Buffer.from(image.data.buffer);
			writeFileSync(output, PNG.sync.write(png));
			resolve();
		} catch (error) {
			reject(new Error(`Failed to write PNG file ${output}: ${error}`));
		}
	});
}

export const codecPngjs = {
	read,
	write,
};

export default codecPngjs;
