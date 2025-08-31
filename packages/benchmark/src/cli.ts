#!/usr/bin/env node

import { join } from "path";
import Table from "cli-table3";
import { runBenchmark, runBinBenchmark } from "./core";
import { runBenchmark as runAntialiasingBenchmark } from "./antialiasing";
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
    const imagePairs = [...pixelmatchImagePairs];
    if (target !== "bin") {
      imagePairs.push(...fourKImagePairs);
    }

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

async function runAntialiasingBenchmarks(iterationsCount: number) {
  try {
    const fourKImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "4k"
    );
    const pixelmatchImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "pixelmatch"
    );
    const imagePairs = [...pixelmatchImagePairs, ...fourKImagePairs];
    const { results, averages } = await runAntialiasingBenchmark(
      imagePairs,
      iterationsCount
    );
    const table = new Table({
      head: [
        "Image",
        "YIQ",
        "FXAA\nGreen Only",
        "FXAA\nFull Luminance",
        "Green\nSpeedup",
        "Accurate\nSpeedup",
      ],
      colWidths: [15, 15, 15, 15, 15, 15],
    });

    for (const result of results) {
      table.push([
        result.name,
        `${result.pixelmatch.time.toFixed(2)}ms`,
        `${result.green.time.toFixed(2)}ms`,
        `${result.accurate.time.toFixed(2)}ms`,
        `${result.greenSpeedup.toFixed(2)}%`,
        `${result.accurateSpeedup.toFixed(2)}%`,
      ]);
    }

    table.push([
      "AVERAGE",
      `${averages.pixelmatch.time.toFixed(2)}ms`,
      `${averages.green.time.toFixed(2)}ms`,
      `${averages.accurate.time.toFixed(2)}ms`,
      `${averages.greenSpeedup.toFixed(2)}%`,
      `${averages.accurateSpeedup.toFixed(2)}%`,
    ]);

    console.log(table.toString());
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

  if (target !== "antialiasing") {
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
  } else {
    const lines = [
      "🚀 Running Antialiasing benchmark",
      ` - ${iterations} iteration${iterations > 1 ? "s" : ""} per image`,
    ];
    console.log(lines.join("\n"));
  }

  if (target === "antialiasing") {
    await runAntialiasingBenchmarks(iterations);
  } else {
    await runCoreBenchmarks(target, iterations);
  }

  console.log("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
