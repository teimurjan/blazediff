import type { BlazeDiffImage, BlazeDiffTransformer } from "@blazediff/types";
import sharp from "sharp";

async function transform(
	input: string | Buffer<ArrayBuffer>,
): Promise<BlazeDiffImage> {
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

async function write(
	image: BlazeDiffImage,
	output: string | Buffer<ArrayBuffer>,
): Promise<void> {
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

const transformer: BlazeDiffTransformer = {
	transform,
	write,
};

export default transformer;
