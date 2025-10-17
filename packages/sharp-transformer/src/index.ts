import sharp from "sharp";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

async function transform(input: string | Buffer): Promise<Image> {
	try {
		const image = await sharp(input)
			.ensureAlpha()
			.raw()
			.toBuffer({ resolveWithObject: true });

		if (!image.info.width || !image.info.height) {
			throw new Error(`Invalid image dimensions: ${input}`);
		}

		return {
			data: image.data,
			width: image.info.width,
			height: image.info.height,
		};
	} catch (error) {
		throw new Error(`Failed to transform image file ${input}: ${error}`);
	}
}

async function write(image: Image, output: string | Buffer): Promise<void> {
	try {
		const sharpImage = sharp(image.data, {
			raw: {
				width: image.width,
				height: image.height,
				channels: 4,
			},
		});

		if (typeof output === "string") {
			await sharpImage.png().toFile(output);
		} else {
			output.set(await sharpImage.png().toBuffer());
		}
	} catch (error) {
		throw new Error(`Failed to write image file ${output}: ${error}`);
	}
}

const transformer = {
	transform,
	write,
};

export default transformer;
