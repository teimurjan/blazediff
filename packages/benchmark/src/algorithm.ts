import pixelmatch from "pixelmatch";
import blazediff from "@blazediff/core";
import transformer from "@blazediff/pngjs-transformer";
import { ImagePair } from "./utils";

export type AlgorithmBenchmarkResult = {
  pixelmatch: number[];
  blazediff: number[];
  speedups: number[];
};

export async function algorithmBenchmark(
  pairs: ImagePair[],
  iterations: number,
  warmup: number
): Promise<AlgorithmBenchmarkResult> {
  const result: AlgorithmBenchmarkResult = {
    pixelmatch: [],
    blazediff: [],
    speedups: [],
  };

  const pairsLoaded = await Promise.all(
    pairs.map(async (pair) => {
      const { a, b, name } = pair;
      const [imageA, imageB] = await Promise.all([
        transformer.transform(a),
        transformer.transform(b),
      ]);

      return {
        a: imageA,
        b: imageB,
        name,
      };
    })
  );

  const speedups: number[] = [];

  for (const pair of pairsLoaded) {
    const { a, b, name } = pair;
    for (let i = 0; i < warmup; i++) {
      blazediff(a.data, b.data, undefined, a.width, a.height);
      pixelmatch(a.data, b.data, undefined, a.width, a.height);
    }
    const blazediffDurations: number[] = [];
    const pixelmatchDurations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const blazediffStart = performance.now();
      const blazediffDiffCount = blazediff(
        a.data,
        b.data,
        undefined,
        a.width,
        a.height
      );
      const blazediffEnd = performance.now();
      const blazediffDuration = blazediffEnd - blazediffStart;
      blazediffDurations.push(blazediffDuration);

      const pixelmatchStart = performance.now();
      const pixelmatchDiffCount = pixelmatch(
        a.data,
        b.data,
        undefined,
        a.width,
        a.height
      );
      const pixelmatchEnd = performance.now();
      const pixelmatchDuration = pixelmatchEnd - pixelmatchStart;
      pixelmatchDurations.push(pixelmatchDuration);

      if (blazediffDiffCount !== pixelmatchDiffCount) {
        throw new Error(
          `Blazediff and Pixelmatch returned different diff counts: ${blazediffDiffCount} vs ${pixelmatchDiffCount} on ${name}`
        );
      }

      speedups.push(
        ((pixelmatchDuration - blazediffDuration) / pixelmatchDuration) * 100
      );
    }

    const averageBlazediff =
      blazediffDurations.reduce((acc, v) => acc + v, 0) /
      blazediffDurations.length;
    const averagePixelmatch =
      pixelmatchDurations.reduce((acc, v) => acc + v, 0) /
      pixelmatchDurations.length;
    const averageSpeedup =
      speedups.reduce((acc, v) => acc + v, 0) / speedups.length;

    result.blazediff.push(averageBlazediff);
    result.pixelmatch.push(averagePixelmatch);
    result.speedups.push(averageSpeedup);
  }

  return result;
}
