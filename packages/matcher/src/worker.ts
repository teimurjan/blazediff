import { parentPort } from "node:worker_threads";
import { runComparison } from "./comparators";
import { loadPNG, normalizeImageInput } from "./image-io";
import type { ComparisonMethod, ImageData, ImageInput, MatcherOptions } from "./types";

/**
 * Ensure ImageData has proper Uint8Array after crossing worker boundary.
 */
function ensureImageData(data: ImageData): ImageData {
	if (data.data instanceof Uint8Array) {
		return data;
	}
	return {
		data: new Uint8Array(data.data),
		width: data.width,
		height: data.height,
	};
}

export interface WorkerRequest {
	id: number;
	type: "normalize" | "compare" | "loadPNG";
	payload: NormalizePayload | ComparePayload | LoadPNGPayload;
}

interface NormalizePayload {
	input: ImageInput;
}

interface LoadPNGPayload {
	filePath: string;
}

interface ComparePayload {
	received: ImageData;
	baseline: ImageInput;
	method: ComparisonMethod;
	options: MatcherOptions;
	diffOutputPath?: string;
}

export interface WorkerResponse {
	id: number;
	success: boolean;
	result?: unknown;
	error?: string;
}

async function handleRequest(request: WorkerRequest): Promise<unknown> {
	switch (request.type) {
		case "normalize": {
			const { input } = request.payload as NormalizePayload;
			return normalizeImageInput(input);
		}
		case "loadPNG": {
			const { filePath } = request.payload as LoadPNGPayload;
			return loadPNG(filePath);
		}
		case "compare": {
			const { received, baseline, method, options, diffOutputPath } = request.payload as ComparePayload;
			return runComparison(ensureImageData(received), baseline, method, options, diffOutputPath);
		}
		default:
			throw new Error(`Unknown request type: ${(request as WorkerRequest).type}`);
	}
}

if (parentPort) {
	parentPort.on("message", async (request: WorkerRequest) => {
		try {
			const result = await handleRequest(request);
			parentPort!.postMessage({
				id: request.id,
				success: true,
				result,
			} satisfies WorkerResponse);
		} catch (error) {
			parentPort!.postMessage({
				id: request.id,
				success: false,
				error: error instanceof Error ? error.message : String(error),
			} satisfies WorkerResponse);
		}
	});
}
