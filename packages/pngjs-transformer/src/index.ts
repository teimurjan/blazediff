import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "fs";
import type { BlazeDiffImage, BlazeDiffTransformer } from "@blazediff/types";

async function transform(filePath: string): Promise<BlazeDiffImage> {
  return new Promise((resolve, reject) => {
    try {
      const buffer = readFileSync(filePath);
      const png = PNG.sync.read(buffer);

      resolve({
        data: png.data,
        width: png.width,
        height: png.height,
      });
    } catch (error) {
      reject(new Error(`Failed to transform PNG file ${filePath}: ${error}`));
    }
  });
}

async function write(
  image: BlazeDiffImage,
  filePath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const png = new PNG({ width: image.width, height: image.height });
      png.data = Buffer.from(image.data.buffer);
      writeFileSync(filePath, PNG.sync.write(png));
      resolve();
    } catch (error) {
      reject(new Error(`Failed to write PNG file ${filePath}: ${error}`));
    }
  });
}

const transformer: BlazeDiffTransformer = {
  transform,
  write,
};

export default transformer;