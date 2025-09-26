import type { ImagePairLoaded } from "../types";

export type AlgorithmBenchmarkArgs = {
	iterations: number;
	warmup: number;
	pairs: ImagePairLoaded[];
};
export type AlgorithmBenchmarkResult = {
	average: number;
	median: number;
	diff: number;
}[];
