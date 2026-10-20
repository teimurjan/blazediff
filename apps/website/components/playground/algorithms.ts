import type { Size } from "./image-header";

export type Algorithm =
	| "pixel"
	| "ssim"
	| "msssim"
	| "hitchhikers-ssim"
	| "gmsd"
	| "milo";

export interface AlgorithmInfo {
	id: Algorithm;
	label: string;
	description: string;
	/** Caption of the map pane in the result. */
	mapLabel: string;
}

export const ALGORITHMS: AlgorithmInfo[] = [
	{
		id: "pixel",
		label: "Pixel diff",
		description:
			"Counts the pixels whose color differs past the threshold. pixelmatch-compatible, Rust compiled to wasm SIMD.",
		mapLabel: "Diff",
	},
	{
		id: "ssim",
		label: "SSIM",
		description: "Structural similarity of luma. 1 means identical.",
		mapLabel: "SSIM map",
	},
	{
		id: "msssim",
		label: "MS-SSIM",
		description: "SSIM at five scales, so it weighs coarse and fine detail.",
		mapLabel: "SSIM map (finest scale)",
	},
	{
		id: "hitchhikers-ssim",
		label: "Hitchhiker's SSIM",
		description:
			"SSIM on non-overlapping windows with coefficient-of-variation pooling. Faster than SSIM.",
		mapLabel: "SSIM map",
	},
	{
		id: "gmsd",
		label: "GMSD",
		description:
			"Gradient magnitude similarity deviation: how much the edges differ. 0 means identical.",
		mapLabel: "Similarity map",
	},
	{
		id: "milo",
		label: "MILO",
		description:
			"Learned perceptual metric that models visual masking. 0 means identical.",
		mapLabel: "Error map",
	},
];

export const algorithmInfo = (id: Algorithm): AlgorithmInfo =>
	ALGORITHMS.find((info) => info.id === id) ?? ALGORITHMS[0];

/** The milo-wasm README measures about 4 s for 1468x294, so about 10 s per MP. */
const MILO_SECONDS_PER_MEGAPIXEL = 10;

export const miloSeconds = ({ width, height }: Size) =>
	Math.max(1, Math.round((width * height * MILO_SECONDS_PER_MEGAPIXEL) / 1e6));

export const usesThreshold = (algorithm: Algorithm, interpret: boolean) =>
	algorithm === "pixel" || interpret;
