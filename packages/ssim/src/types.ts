/** RGBA8 pixels, `width * height * 4` bytes. Same shape as `@blazediff/core`'s `Image`. */
export interface Image {
	data: Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

/** How a pyramid's per-scale scores collapse into one number. */
export type PoolingMethod = "product" | "weighted-sum";

/** Knobs specific to `msssim`. */
export interface MsSsimOptions {
	/**
	 * Per-scale weights; the length sets the number of scales.
	 * Default: `[0.0448, 0.2856, 0.3001, 0.2363, 0.1333]`
	 */
	weights?: number[];
	/** Default: `"product"` */
	method?: PoolingMethod;
}

/** Knobs specific to `hitchhikersSSIM`. */
export interface HitchhikersOptions {
	/** Distance between window origins. Default: `windowSize` (non-overlapping windows) */
	windowStride?: number;
	/** Pool with `1 - stddev/mean` instead of the plain mean. Default: true */
	covPooling?: boolean;
}

/**
 * Options for every SSIM variant. Field names match `@blazediff/ssim-native`;
 * each function reads the shared knobs plus its own block.
 */
export interface SsimOptions {
	/** Side of the local window. Default: 11 */
	windowSize?: number;
	/** Luminance stability constant: `c1 = (k1·L)²`. Default: 0.01 */
	k1?: number;
	/** Contrast stability constant: `c2 = (k2·L)²`. Default: 0.03 */
	k2?: number;
	/** Sample bit depth, setting `L = 2^bitDepth - 1`. Default: 8 */
	bitDepth?: number;
	/** Read by `msssim` only. */
	msSsim?: MsSsimOptions;
	/** Read by `hitchhikersSSIM` only. */
	hitchhikers?: HitchhikersOptions;
	/** Draw the local score map here as grayscale, dark where similarity is low. */
	output?: Image;
}

export type SsimResult =
	| {
			kind: "compared";
			/** Pooled similarity, 1 when identical. */
			score: number;
	  }
	| { kind: "dimension-mismatch"; a: Size; b: Size };
