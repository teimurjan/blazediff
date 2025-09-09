import { BlazeDiffImage } from "@blazediff/types";

export type ImagePair = {
  a: string;
  b: string;
  name: string;
};

export type ImagePairLoaded = {
  a: BlazeDiffImage;
  b: BlazeDiffImage;
  name: string;
};

export type BenchmarkArgs = {
  iterations: number;
  target: string;
  variant: string;
  format?: "markdown" | "json";
  output?: string;
};
