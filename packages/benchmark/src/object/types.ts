export type ObjectPair = {
	a: unknown;
	b: unknown;
	name: string;
};

export type BenchmarkArgs = {
	iterations: number;
	target: string;
	variant: string;
	format?: "markdown" | "json";
	output?: string;
};