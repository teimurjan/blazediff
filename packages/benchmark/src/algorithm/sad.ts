import sad from "@blazediff/sad";
import { AlgorithmBenchmarkArgs, AlgorithmBenchmarkResult } from "./types";

export function sadAlgorithmBenchmark({
  pairs,
  iterations,
  warmup,
}: AlgorithmBenchmarkArgs): AlgorithmBenchmarkResult {
  const result: AlgorithmBenchmarkResult = [];

  for (const pair of pairs) {
    const { a, b } = pair;
    for (let i = 0; i < warmup; i++) {
      sad(a.data, b.data, undefined, a.width, a.height);
    }

    const durations: number[] = [];

    let diffCount = 0;

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      diffCount = sad(a.data, b.data, undefined, a.width, a.height);
      console.log(diffCount);
      const end = performance.now();
      const duration = end - start;
      durations.push(duration);
    }

    const average =
      durations.reduce((acc, duration) => acc + duration, 0) / durations.length;
    const median = durations.sort((a, b) => a - b)[
      Math.floor(durations.length / 2)
    ];

    result.push({ average, median, diff: diffCount });
  }

  return result;
}
