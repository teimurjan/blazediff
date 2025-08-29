import { readdirSync } from "fs";
import { join } from "path";
import pixelmatch from "pixelmatch";
import blazediff from "@blazediff/core";
import transformer from "@blazediff/pngjs-transformer";
import { execSync } from "child_process";

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
  fixturesDir: string,
  iterations: number
): Promise<BenchmarkSummary> {
  const results: BenchmarkResult[] = [];

  const fourKImagePairs = await getImagePairs(fixturesDir, "4k");

  for (const pair of fourKImagePairs) {
    const result = await benchmarkBinImagePair(pair, iterations);
    results.push(result);
  }

  const averages = calculateAverages(results);

  return { results, averages };
}

export async function runBenchmark(
  fixturesDir: string,
  iterations: number
): Promise<BenchmarkSummary> {
  const results: BenchmarkResult[] = [];

  const pixelmatchImagePairs = await getImagePairs(fixturesDir, "pixelmatch");
  const fourKImagePairs = await getImagePairs(fixturesDir, "4k");

  for (const pair of pixelmatchImagePairs) {
    const result = await benchmarkImagePair(pair, iterations);
    results.push(result);
  }

  for (const pair of fourKImagePairs) {
    const result = await benchmarkImagePair(pair, iterations);
    results.push(result);
  }

  const averages = calculateAverages(results);

  return { results, averages };
}

async function getImagePairs(
  fixturesDir: string,
  fixturesSubDir: string
): Promise<Array<{ a: string; b: string; name: string }>> {
  const pairs: Array<{ a: string; b: string; name: string }> = [];

  // Look for pairs like 1a.png, 1b.png
  const dir = join(fixturesDir, fixturesSubDir);
  const files = readdirSync(dir);
  const pngFiles = files.filter((f: string) => f.endsWith(".png"));

  const pairMap = new Map<string, { a?: string; b?: string }>();

  for (const file of pngFiles) {
    const baseName = file.replace(/[ab]\.png$/, "");
    if (!pairMap.has(baseName)) {
      pairMap.set(baseName, {});
    }

    if (file.endsWith("a.png")) {
      pairMap.get(baseName)!.a = file;
    } else if (file.endsWith("b.png")) {
      pairMap.get(baseName)!.b = file;
    }
  }

  for (const [name, pair] of pairMap) {
    if (pair.a && pair.b) {
      pairs.push({
        a: join(fixturesDir, fixturesSubDir, pair.a),
        b: join(fixturesDir, fixturesSubDir, pair.b),
        name: `${fixturesSubDir}/${name}`,
      });
    }
  }

  return pairs;
}

async function benchmarkBinImagePair(
  pair: { a: string; b: string; name: string },
  iterations: number
): Promise<BenchmarkResult> {
  const { a, b, name } = pair;

  const blazediffTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const binPath = join(__dirname, "../node_modules/.bin/blazediff");
    safeExecSync(`${binPath} ${a} ${b} --transformer sharp`);
    const end = performance.now();

    blazediffTimes.push(end - start);
  }

  const pixelmatchTimes: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    const binaryPath = join(__dirname, "../node_modules/.bin/pixelmatch");
    safeExecSync(`${binaryPath} ${a} ${b}`);
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
  pair: { a: string; b: string; name: string },
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

const safeExecSync = (command: string): string => {
  try {
    const result = execSync(command, { encoding: "utf8" });
    return result.toString();
  } catch (error: any) {
    return error.stderr.toString();
  }
};

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
