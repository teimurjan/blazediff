#!/usr/bin/env node

import { join } from "path";
import {
  getImagePairs,
  loadImagePairs,
  outputResults,
  parseBenchmarkArgs,
} from "./utils";
import { BenchmarkArgs } from "./types";

async function runBenchmark({
  variant,
  target,
  iterations,
  format,
  output,
}: BenchmarkArgs) {
  try {
    const fourKImagePairs = getImagePairs(join(__dirname, "../fixtures"), "4k");
    const pixelmatchImagePairs = getImagePairs(
      join(__dirname, "../fixtures"),
      "pixelmatch"
    );
    const pageImagePairs = getImagePairs(
      join(__dirname, "../fixtures"),
      "page"
    );
    const pairs =
      target === "bin"
        ? [...fourKImagePairs, ...pageImagePairs]
        : [...pixelmatchImagePairs, ...fourKImagePairs, ...pageImagePairs];

    // Shuffle pairs
    pairs.sort(() => Math.random() - 0.5);

    const warmup = 5;

    if (variant === "algorithm") {
      const pairsLoaded = await loadImagePairs(pairs);

      if (target === "blazediff") {
        const { blazediffAlgorithmBenchmark } = await import(
          "./algorithm/blazediff"
        );
        const results = blazediffAlgorithmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      } else if (target === "pixelmatch") {
        const { pixlematchAlgorithmBenchmark } = await import(
          "./algorithm/pixlematch"
        );
        const results = pixlematchAlgorithmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      } else if (target === "sad") {
        const { sadAlgorithmBenchmark } = await import("./algorithm/sad");
        const results = sadAlgorithmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      } else if (target === "ssim") {
        const { ssimAlgorithmBenchmark } = await import("./algorithm/ssim");
        const results = ssimAlgorithmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      }
    } else if (variant === "binary") {
      if (target === "blazediff") {
        const { blazediffBinaryBenchmark } = await import("./binary/blazediff");
        const results = await blazediffBinaryBenchmark({
          pairs,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      } else if (target === "pixelmatch") {
        const { pixlematchBinaryBenchmark } = await import(
          "./binary/pixelmatch"
        );
        const results = await pixlematchBinaryBenchmark({
          pairs,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      }
    } else if (variant === "wasm") {
      const pairsLoaded = await loadImagePairs(pairs);

      if (target === "blazediff") {
        const { blazediffWasmBenchmark } = await import("./wasm/blazediff");
        const results = await blazediffWasmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results, format, output);
      }
    }
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    process.exit(1);
  }
}

async function main() {
  const { iterations, target, variant, format, output } = parseBenchmarkArgs();

  await runBenchmark({ target, variant, iterations, format, output });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
