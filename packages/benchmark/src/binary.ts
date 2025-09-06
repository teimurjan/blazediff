import { ImagePair, safeExecSync } from "./utils";

export type BinaryBenchmarkResult = {
  pixelmatch: number[];
  blazediff: number[];
  speedups: number[];
};

export async function binaryBenchmark(
  pairs: ImagePair[],
  iterations: number,
  warmup: number
): Promise<BinaryBenchmarkResult> {
  const result: BinaryBenchmarkResult = {
    pixelmatch: [],
    blazediff: [],
    speedups: [],
  };

  const speedups: number[] = [];

  for (const pair of pairs) {
    const { a, b } = pair;

    // blazediff warmup
    for (let i = 0; i < warmup; i++) {
      const bin = "pnpm --filter @blazediff/benchmark exec blazediff";
      await safeExecSync(`${bin} ${a} ${b} --transformer sharp`);
    }
    // pixelmatch warmup
    for (let i = 0; i < warmup; i++) {
      const bin = "pnpm --filter @blazediff/benchmark exec pixelmatch";
      await safeExecSync(`${bin} ${a} ${b} --transformer sharp`);
    }

    const blazediffDurations: number[] = [];
    const pixelmatchDurations: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const blazediffStart = performance.now();
      {
        const bin = "pnpm --filter @blazediff/benchmark exec blazediff";
        await safeExecSync(`${bin} ${a} ${b} --transformer sharp`);
      }
      const blazediffEnd = performance.now();
      const blazediffDuration = blazediffEnd - blazediffStart;
      blazediffDurations.push(blazediffDuration);

      const pixelmatchStart = performance.now();
      {
        const bin = "pnpm --filter @blazediff/benchmark exec pixelmatch";
        await safeExecSync(`${bin} ${a} ${b} --transformer sharp`);
      }
      const pixelmatchEnd = performance.now();
      const pixelmatchDuration = pixelmatchEnd - pixelmatchStart;
      pixelmatchDurations.push(pixelmatchDuration);

      speedups.push(
        ((pixelmatchDuration - blazediffDuration) / pixelmatchDuration) * 100
      );
    }

    const averageBlazediff =
      blazediffDurations.reduce((acc, value) => acc + value, 0) /
      blazediffDurations.length;
    const averagePixelmatch =
      pixelmatchDurations.reduce((acc, value) => acc + value, 0) /
      pixelmatchDurations.length;
    const averageSpeedup =
      speedups.reduce((acc, value) => acc + value, 0) / speedups.length;

    result.blazediff.push(averageBlazediff);
    result.pixelmatch.push(averagePixelmatch);
    result.speedups.push(averageSpeedup);
  }

  return result;
}
