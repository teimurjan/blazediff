export interface Image {
	data: Uint8Array;
	width: number;
	height: number;
}

export type ImagePair = {
	a: string;
	b: string;
	name: string;
};

export type ImagePairLoaded = {
	a: Image;
	b: Image;
	name: string;
};

export type BenchmarkArgs = {
	iterations: number;
	target: string;
	variant: string;
	format?: "markdown" | "json";
	output?: string;
	fixtures?: string[];
};
