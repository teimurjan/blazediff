import { join } from "path";
import pixelmatch from "pixelmatch";
import blazediff from "@blazediff/core";
import transformer from "@blazediff/pngjs-transformer";
import { ImagePair, safeExec } from "./utils";

export interface BenchmarkResult {
  name: string;
  blazediff: {
    timeMs: number;
  };
  pixelmatch: {
    timeMs: number;
  };
  speedup: number;
}

export interface BenchmarkSummary {
  results: BenchmarkResult[];
  averages: {
    blazediff: {
      timeMs: number;
    };
    pixelmatch: {
      timeMs: number;
    };
    speedup: number;
  };
}

export async function runBinBenchmark(
  imagePairs: ImagePair[],
  iterations: number
): Promise<BenchmarkSummary> {
  const results: BenchmarkResult[] = [];

  for (const pair of imagePairs) {
    const result = await benchmarkBinImagePair(pair, iterations);
    results.push(result);
  }

  const averages = calculateAverages(results);

  return { results, averages };
}

export async function runBenchmark(
  imagePairs: ImagePair[],
  iterations: number
): Promise<BenchmarkSummary> {
  const results: BenchmarkResult[] = [];

  for (const pair of imagePairs) {
    const result = await benchmarkImagePair(pair, iterations);
    results.push(result);
  }

  const averages = calculateAverages(results);

  return { results, averages };
}

async function benchmarkBinImagePair(
  pair: ImagePair,
  iterations: number
): Promise<BenchmarkResult> {
  const { a, b, name } = pair;

  const blazediffTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const binPath = join(__dirname, "../node_modules/.bin/blazediff");
    await safeExec(`${binPath} ${a} ${b} --transformer sharp`);
    const end = performance.now();

    blazediffTimes.push(end - start);
  }

  const pixelmatchTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const binaryPath = join(__dirname, "../node_modules/.bin/pixelmatch");
    await safeExec(`${binaryPath} ${a} ${b}`);
    const end = performance.now();

    pixelmatchTimes.push(end - start);
  }

  const blazediffAvgTime =
    blazediffTimes.reduce((a, b) => a + b, 0) / iterations;
  const pixelmatchAvgTime =
    pixelmatchTimes.reduce((a, b) => a + b, 0) / iterations;

  return {
    name: name,
    blazediff: {
      timeMs: blazediffAvgTime,
    },
    pixelmatch: {
      timeMs: pixelmatchAvgTime,
    },
    speedup: ((pixelmatchAvgTime - blazediffAvgTime) / pixelmatchAvgTime) * 100,
  };
}

async function benchmarkImagePair(
  pair: ImagePair,
  iterations: number
): Promise<BenchmarkResult> {
  const { a, b, name } = pair;

  const [imageA, imageB] = await Promise.all([
    transformer.transform(a),
    transformer.transform(b),
  ]);

  const blazediffTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    blazediff(imageA.data, imageB.data, undefined, imageA.width, imageB.height);
    const end = performance.now();

    blazediffTimes.push(end - start);
  }

  const pixelmatchTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    pixelmatch(
      imageA.data,
      imageB.data,
      undefined,
      imageA.width,
      imageB.height,
      { threshold: 0.1 }
    );
    const end = performance.now();

    pixelmatchTimes.push(end - start);
  }

  const blazediffAvgTime =
    blazediffTimes.reduce((a, b) => a + b, 0) / iterations;
  const pixelmatchAvgTime =
    pixelmatchTimes.reduce((a, b) => a + b, 0) / iterations;

  return {
    name: name,
    blazediff: {
      timeMs: blazediffAvgTime,
    },
    pixelmatch: {
      timeMs: pixelmatchAvgTime,
    },
    speedup: ((pixelmatchAvgTime - blazediffAvgTime) / pixelmatchAvgTime) * 100,
  };
}

function calculateAverages(results: BenchmarkResult[]) {
  const blazediffTimes = results.map((r) => r.blazediff.timeMs);
  const pixelmatchTimes = results.map((r) => r.pixelmatch.timeMs);

  const speedups = results.map((r) => r.speedup);

  return {
    blazediff: {
      timeMs: blazediffTimes.reduce((a, b) => a + b, 0) / results.length,
    },
    pixelmatch: {
      timeMs: pixelmatchTimes.reduce((a, b) => a + b, 0) / results.length,
    },
    speedup: speedups.reduce((a, b) => a + b, 0) / results.length,
  };
}
