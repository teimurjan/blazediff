import type { ImagePairLoaded } from "../types";

export type WasmBenchmarkArgs = {
	iterations: number;
	warmup: number;
	pairs: ImagePairLoaded[];
};
export type WasmBenchmarkResult = {
	average: number;
	median: number;
	diff: number;
}[];
