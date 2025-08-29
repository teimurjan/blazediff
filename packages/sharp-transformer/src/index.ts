import sharp from "sharp";
import type { BlazeDiffImage, BlazeDiffTransformer } from "@blazediff/types";

async function transform(filePath: string): Promise<BlazeDiffImage> {
  try {
    let image = sharp(filePath);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw new Error(`Invalid image dimensions: ${filePath}`);
    }

    if (metadata.channels !== 4) {
      image = image.joinChannel(
        Buffer.alloc(metadata.width * metadata.height, 255),
        {
          raw: {
            width: metadata.width,
            height: metadata.height,
            channels: 1,
          },
        }
      );
    }

    const rawBuffer = await image.raw().toBuffer({ resolveWithObject: true });
    return {
      data: rawBuffer.data,
      width: metadata.width,
      height: metadata.height,
    };
  } catch (error) {
    throw new Error(`Failed to transform image file ${filePath}: ${error}`);
  }
}

async function write(image: BlazeDiffImage, filePath: string): Promise<void> {
  try {
    const sharpImage = sharp(image.data, {
      raw: {
        width: image.width,
        height: image.height,
        channels: 4,
      },
    });

    await sharpImage.png().toFile(filePath);
  } catch (error) {
    throw new Error(`Failed to write image file ${filePath}: ${error}`);
  }
}

const transformer: BlazeDiffTransformer = {
  transform,
  write,
};

export default transformer;
