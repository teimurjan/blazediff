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
export {
	assertImage,
	assertOptions,
	assertTargets,
	isValidImage,
} from "./validate";
export { windowSide } from "./window";
