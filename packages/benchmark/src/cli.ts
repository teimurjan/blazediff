#!/usr/bin/env node

import { join } from "path";
import Table from "cli-table3";
import { runBenchmark, runBinBenchmark } from "./index";
import { getImagePairs } from "./utils";

async function runCoreBenchmarks(target: string, iterationsCount: number) {
  try {
    const benchmark = target === "bin" ? runBinBenchmark : runBenchmark;

    const fourKImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "4k"
    );
    const pixelmatchImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "pixelmatch"
    );
    const imagePairs =
      target === "bin"
        ? [...fourKImagePairs]
        : [...pixelmatchImagePairs, ...fourKImagePairs];

    // warmup
    await benchmark(imagePairs, 3);

    const results = await benchmark(imagePairs, iterationsCount);

    const table = new Table({
      head: ["Image", "BlazeDiff", "Pixelmatch", "Speedup"],
      colWidths: [15, 25, 25, 20],
    });

    for (const result of results.results) {
      table.push([
        result.name,
        `${result.blazediff.timeMs.toFixed(2)}ms`,
        `${result.pixelmatch.timeMs.toFixed(2)}ms`,
        `${result.speedup.toFixed(2)}%`,
      ]);
    }

    table.push([
      "AVERAGE",
      `${results.averages.blazediff.timeMs.toFixed(2)}ms`,
      `${results.averages.pixelmatch.timeMs.toFixed(2)}ms`,
      `${results.averages.speedup.toFixed(2)}%`,
    ]);

    console.log(table.toString());

    console.log("\n📊 Summary:");
    console.log(
      `• BlazeDiff is ${results.averages.speedup.toFixed(2)}x faster on average`
    );
    console.log(`• Tested ${results.results.length} image pairs`);
    console.log(
      `• ${iterationsCount} iteration${
        iterationsCount > 1 ? "s" : ""
      } per image for accuracy`
    );
  } catch (error) {
    console.error("❌ Benchmark failed:", error);
    process.exit(1);
  }
}

const parseArgs = () => {
  const args = process.argv.slice(2);
  const iterationsStr = args
    .find((arg) => arg.startsWith("--iterations="))
    ?.split("=")[1];
  const iterations = iterationsStr ? parseInt(iterationsStr, 10) : 25;
  const target =
    args.find((arg) => arg.startsWith("--target="))?.split("=")[1] ?? "core";

  return { iterations, target };
};

async function main() {
  const { iterations, target } = parseArgs();

  const lines = [
    "🚀 Running BlazeDiff vs Pixelmatch benchmark",
    ` - ${iterations} iteration${iterations > 1 ? "s" : ""} per image`,
    ` - ${
      target === "bin"
        ? "Using binary (blazediff with sharp transformer ⚡️)"
        : "Using core (both with pngjs transformer)"
    }`,
  ];
  console.log(lines.join("\n"));

  await runCoreBenchmarks(target, iterations);

  console.log("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
