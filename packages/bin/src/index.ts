import type { BlazeDiffOptions, BlazeDiffTransformer } from "@blazediff/types";
import blazediff from "@blazediff/core";

export interface BlazeDiffBinOptions {
  outputPath?: string;
  transformer: BlazeDiffTransformer;
  coreOptions?: BlazeDiffOptions;
}

export interface BlazeDiffBinResult {
  diffCount: number;
  width: number;
  height: number;
  outputData?: Uint8Array;
  duration: number;
}

export default async function blazeDiffBin(
  image1Path: string,
  image2Path: string,
  options: BlazeDiffBinOptions
): Promise<BlazeDiffBinResult> {
  const [image1, image2] = await Promise.all([
    options.transformer.transform(image1Path),
    options.transformer.transform(image2Path),
  ]);

  if (image1.width !== image2.width || image1.height !== image2.height) {
    throw new Error(
      `Image dimensions do not match: ${image1.width}x${image1.height} vs ${image2.width}x${image2.height}`
    );
  }

  let outputData: Uint8Array | undefined;
  if (options.outputPath) {
    outputData = new Uint8Array(image1.data.length);
  }

  const startTime = performance.now();
  const diffCount = blazediff(
    image1.data,
    image2.data,
    outputData,
    image1.width,
    image1.height,
    options.coreOptions
  );
  const duration = performance.now() - startTime;

  if (diffCount > 0 && options.outputPath && outputData) {
    await options.transformer.write(
      {
        data: outputData,
        width: image1.width,
        height: image1.height,
      },
      options.outputPath
    );
  }

  return {
    diffCount,
    width: image1.width,
    height: image1.height,
    outputData,
    duration,
  };
}
