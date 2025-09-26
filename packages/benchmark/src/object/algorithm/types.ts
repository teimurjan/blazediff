import type { ObjectPair } from "../types";

export type ObjectAlgorithmBenchmarkArgs = {
	iterations: number;
	warmup: number;
	pairs: ObjectPair[];
};

export type ObjectAlgorithmBenchmarkResult = {
	average: number;
	median: number;
	diff: boolean;
}[];