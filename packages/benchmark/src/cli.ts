#!/usr/bin/env node

import { join } from "path";
import Table from "cli-table3";
import { runBenchmark, runBinBenchmark } from "./index";

async function main() {
  const args = process.argv.slice(2);
  const iterations = args
    .find((arg) => arg.startsWith("--iterations="))
    ?.split("=")[1];
  const isBin = args.includes("--bin");
  const iterationsCount = iterations ? parseInt(iterations, 10) : 25;

  const lines = [
    "🚀 Running BlazeDiff vs Pixelmatch benchmark",
    ` - ${iterationsCount} iteration${
      iterationsCount > 1 ? "s" : ""
    } per image`,
    ` - ${
      isBin
        ? "Using binary (blazediff with sharp transformer ⚡️)"
        : "Using core (both with pngjs transformer)"
    }`,
  ];
  console.log(lines.join("\n"));
  console.log("\n");

  try {
    // warmup
    await (isBin
      ? runBinBenchmark(join(__dirname, "../fixtures"), 3)
      : runBenchmark(join(__dirname, "../fixtures"), 3));

    const fixturesDir = join(__dirname, "../fixtures");
    const results = isBin
      ? await runBinBenchmark(fixturesDir, iterationsCount)
      : await runBenchmark(fixturesDir, iterationsCount);

    const table = new Table({
      head: [
        "Image",
        "BlazeDiff",
        "Pixelmatch",
        "Speedup",
      ],
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

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
