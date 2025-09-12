import type { ImagePair } from "../types";

export type BinaryBenchmarkArgs = {
	iterations: number;
	warmup: number;
	pairs: ImagePair[];
};

export type BinaryBenchmarkResult = {
	average: number;
	median: number;
}[];
