import { diff } from "./diff";

export { antialiased, brightnessDelta } from "./antialiasing";
export { diff } from "./diff";
export {
	calculateOptimalBlockSize,
	colorDelta,
	drawGrayPixel,
	drawPixel,
	isValidImage,
} from "./engine";
export { BlazeDiffError, type BlazeDiffErrorCode } from "./errors";
export type {
	DiffOptions,
	DiffResult,
	Image,
	Metric,
	PixelData,
	RenderOptions,
	Rgb,
	Size,
	WindowHit,
} from "./types";
export { assertImage, assertOptions, assertTargets } from "./validate";
export { windowSide } from "./window";

export default diff;
