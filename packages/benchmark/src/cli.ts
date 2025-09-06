#!/usr/bin/env node

import { join } from "path";
import Table from "cli-table3";
import { getImagePairs } from "./utils";
import { algorithmBenchmark } from "./algorithm";
import { binaryBenchmark } from "./binary";

async function runCoreBenchmarks(target: string, iterations: number) {
  try {
    const benchmark = target === "bin" ? binaryBenchmark : algorithmBenchmark;

    const fourKImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "4k"
    );
    const pixelmatchImagePairs = await getImagePairs(
      join(__dirname, "../fixtures"),
      "pixelmatch"
    );
    const pairs =
      target === "bin"
        ? [...fourKImagePairs]
        : [...pixelmatchImagePairs, ...fourKImagePairs];

    const warmup = 3;
    const { blazediff, pixelmatch, speedups } = await benchmark(
      pairs,
      iterations,
      warmup
    );

    const table = new Table({
      head: ["Benchmark", "Pixelmatch", "BlazeDiff", "Speedup"],
      colWidths: [15, 25, 25, 20],
    });

    let totalPixelmatchTime = 0;
    let totalBlazeDiffTime = 0;

    for (let i = 0; i < pairs.length; i++) {
      const { name } = pairs[i];
      const pixelmatchAverage = pixelmatch[i];
      const blazediffAverage = blazediff[i];

      table.push([
        name,
        `${pixelmatchAverage.toFixed(2)}ms`,
        `${blazediffAverage.toFixed(2)}ms`,
        `${(
          ((pixelmatchAverage - blazediffAverage) / pixelmatchAverage) *
          100
        ).toFixed(2)}%`,
      ]);

      totalPixelmatchTime += pixelmatchAverage;
      totalBlazeDiffTime += blazediffAverage;
    }

    const totalPixelmatchAverage = totalPixelmatchTime / pairs.length;
    const totalBlazeDiffAverage = totalBlazeDiffTime / pairs.length;
    const totalSpeedUp =
      speedups && speedups.length === pairs.length
        ? speedups.reduce((a, b) => a + b, 0) / speedups.length
        : ((totalPixelmatchAverage - totalBlazeDiffAverage) /
            totalPixelmatchAverage) *
          100;

    table.push([
      "AVERAGE",
      `${totalPixelmatchAverage.toFixed(2)}ms`,
      `${totalBlazeDiffAverage.toFixed(2)}ms`,
      `${totalSpeedUp.toFixed(2)}%`,
    ]);

    console.log(table.toString());

    console.log("\n📊 Summary:");
    console.log(`• BlazeDiff is ${totalSpeedUp.toFixed(2)}% faster on average`);
    console.log(
      `• Tested ${pairs.length} image pairs`
    );
    console.log(
      `• ${iterations} iteration${
        iterations > 1 ? "s" : ""
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
