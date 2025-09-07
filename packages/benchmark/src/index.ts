#!/usr/bin/env node

import { join } from "path";
import Table from "cli-table3";
import { getImagePairs, loadImagePairs, parseBenchmarkArgs } from "./utils";
import { ImagePair } from "./types";
import { AlgorithmBenchmarkResult } from "./algorithm/types";
import { BinaryBenchmarkResult } from "./binary/types";
import { BenchmarkArgs } from "./types";

async function runBenchmark({ variant, target, iterations }: BenchmarkArgs) {
  try {
    const fourKImagePairs = getImagePairs(join(__dirname, "../fixtures"), "4k");
    const pixelmatchImagePairs = getImagePairs(
      join(__dirname, "../fixtures"),
      "pixelmatch"
    );
    const pairs =
      target === "bin"
        ? [...fourKImagePairs]
        : [...pixelmatchImagePairs, ...fourKImagePairs];

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
        outputResults(pairs, results);
      } else if (target === "pixelmatch") {
        const { pixlematchAlgorithmBenchmark } = await import(
          "./algorithm/pixlematch"
        );
        const results = pixlematchAlgorithmBenchmark({
          pairs: pairsLoaded,
          iterations,
          warmup,
        });
        outputResults(pairs, results);
      }
    } else if (variant === "binary") {
      if (target === "blazediff") {
        const { blazediffBinaryBenchmark } = await import("./binary/blazediff");
        const results = await blazediffBinaryBenchmark({
          pairs,
          iterations,
          warmup,
        });
        outputResults(pairs, results);
      } else if (target === "pixelmatch") {
        const { pixlematchBinaryBenchmark } = await import(
          "./binary/pixelmatch"
        );
        const results = await pixlematchBinaryBenchmark({
          pairs,
          iterations,
          warmup,
        });
        outputResults(pairs, results);
      }
    }
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    process.exit(1);
  }
}

const outputResults = (
  pairs: ImagePair[],
  results: AlgorithmBenchmarkResult | BinaryBenchmarkResult
) => {
  const table = new Table({
    head: ["Benchmark", "Average", "Median"],
    colWidths: [15, 25, 25],
  });

  const rows: string[][] = [];

  for (let i = 0; i < pairs.length; i++) {
    const { name } = pairs[i];
    const average = results[i].average;
    const median = results[i].median;

    rows.push([name, `${average.toFixed(2)}ms`, `${median.toFixed(2)}ms`]);
  }

  // Unshuffle rows
  rows.sort((a, b) => a[0].localeCompare(b[0]));

  table.push(...rows);

  console.log(table.toString());
};

async function main() {
  const { iterations, target, variant } = parseBenchmarkArgs();

  const lines = [
    `🚀 Running ${target} ${variant} benchmark`,
    ` - ${iterations} iteration${iterations > 1 ? "s" : ""} per image`,
    ` - Variant: ${variant}, Target: ${target}`,
  ];
  console.log(lines.join("\n"));

  await runBenchmark({ target, variant, iterations });

  console.log("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
