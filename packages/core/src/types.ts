import type { PixelData } from "./pixel";

export type { PixelData };

export type Rgb = [number, number, number];

/** RGBA8 pixels, `width * height * 4` bytes. Browser `ImageData` fits as is. */
export interface Image {
	data: PixelData;
	width: number;
	height: number;
}

/** `yiq`: the metric pixelmatch used before v8. `oklab`: pixelmatch 8's OKLab HyAB metric. */
export type Metric = "yiq" | "oklab";

export interface RenderOptions {
	/** Opacity of the unchanged image in the output (0-1). Default: 0.1 */
	alpha?: number;
	/** Default: [255, 0, 0] */
	diffColor?: Rgb;
	/** Color for pixels that get darker in `b`. Default: `diffColor` */
	diffColorAlt?: Rgb;
	/** Color for detected anti-aliased pixels. Default: [255, 255, 0] */
	aaColor?: Rgb;
	/** `faded`: a gray copy of `a` under the diff. `transparent`: the diff alone on a cleared buffer. Default: `faded` */
	background?: "faded" | "transparent";
}

export interface DiffOptions {
	/**
	 * Color difference threshold (0-1). Lower is stricter. Default: 0.1.
	 * With `yiq` it scales a squared distance; with `oklab`, 1 is black vs white.
	 */
	threshold?: number;
	/** Detect anti-aliased pixels and leave them out of the count. Default: true */
	antialiasing?: boolean;
	/** Default: `yiq` */
	metric?: Metric;
	/** One byte per pixel (`width * height`); pixels with a non-zero byte are skipped. */
	mask?: PixelData;
	/** Also report the N×N window with the most diff pixels. N is clamped to [1, min(width, height)]. */
	window?: number;
	/** Draw the diff here. Omit for a count-only comparison. */
	output?: Image;
	render?: RenderOptions;
}

export interface Size {
	width: number;
	height: number;
}

/** Top-left corner and diff count of the busiest window. */
export interface WindowHit {
	x: number;
	y: number;
	count: number;
}

export type DiffResult =
	| {
			kind: "compared";
			/** Pixels that differ beyond `threshold`, after the mask and AA exclusion. */
			count: number;
			/** `count` as a percentage of all pixels. */
			percentage: number;
			/** True when `count` is 0. */
			identical: boolean;
			/** Present when the `window` option is set. */
			window?: WindowHit;
	  }
	| { kind: "dimension-mismatch"; a: Size; b: Size };
