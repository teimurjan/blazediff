// Types

// Comparators
export {
	runComparison,
	validateMethodSupportsInput,
} from "./comparators";

// Image I/O utilities
export {
	fileExists,
	isFilePath,
	isImageBuffer,
	isImageData,
	isRawPngBuffer,
	loadPNG,
	normalizeImageInput,
	savePNG,
	saveRawPNGBuffer,
} from "./image-io";
export type { FormatOptions } from "./reporter";
// Reporter (for customization)
export { formatMessage as formatReport } from "./reporter";
// Snapshot management
export { compareImages, getOrCreateSnapshot } from "./snapshot";

// Worker utilities
export { terminateWorker } from "./worker-pool";
export type {
	ComparisonMethod,
	ComparisonResult,
	ImageData,
	ImageInput,
	MatcherOptions,
	TestContext,
} from "./types";
