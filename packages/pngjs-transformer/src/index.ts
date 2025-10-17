import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

async function transform(input: string | Buffer): Promise<Image> {
	return new Promise((resolve, reject) => {
		try {
			const buffer = typeof input === "string" ? readFileSync(input) : input;
			const png = PNG.sync.read(buffer);

			resolve({
				data: png.data,
				width: png.width,
				height: png.height,
			});
		} catch (error) {
			reject(new Error(`Failed to transform PNG file ${input}: ${error}`));
		}
	});
}

async function write(
	image: Image,
	output: string | Buffer,
): Promise<void> {
	return new Promise((resolve, reject) => {
		try {
			const png = new PNG({ width: image.width, height: image.height });
			png.data = Buffer.from(image.data.buffer);
			writeFileSync(output, PNG.sync.write(png));
			resolve();
		} catch (error) {
			reject(new Error(`Failed to write PNG file ${output}: ${error}`));
		}
	});
}

const transformer = {
	transform,
	write,
};

export default transformer;
