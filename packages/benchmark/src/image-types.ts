export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
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
};
