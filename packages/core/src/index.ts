import { diff } from "./diff";

export {
	assertImage,
	assertOptions,
	assertTargets,
	BlazeDiffError,
	type BlazeDiffErrorCode,
	type DiffOptions,
	type DiffResult,
	type Image,
	isValidImage,
	type Metric,
	type PixelData,
	type RenderOptions,
	type Rgb,
	type Size,
	type WindowHit,
	windowSide,
} from "@blazediff/contract";
export { antialiased, brightnessDelta } from "./antialiasing";
export { diff } from "./diff";
export {
	calculateOptimalBlockSize,
	colorDelta,
	drawGrayPixel,
	drawPixel,
} from "./engine";

export default diff;
