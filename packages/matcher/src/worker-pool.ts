import { existsSync } from "node:fs";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import type { WorkerRequest, WorkerResponse } from "./worker";
import type { ComparisonMethod, ImageData, ImageInput, MatcherOptions } from "./types";
import type { RunComparisonResult } from "./comparators";

let worker: Worker | null = null;
let requestId = 0;
let useInProcessFallback = false;
const pendingRequests = new Map<number, {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
}>();

function getWorkerPath(): string | null {
	// Try dist/worker.js first (production)
	const distPath = join(__dirname, "worker.js");
	if (existsSync(distPath)) {
		return distPath;
	}
	// Try ../dist/worker.js (when running from src/)
	const srcToDistPath = join(__dirname, "../dist/worker.js");
	if (existsSync(srcToDistPath)) {
		return srcToDistPath;
	}
	return null;
}

function getWorker(): Worker | null {
	if (useInProcessFallback) {
		return null;
	}

	if (!worker) {
		const workerPath = getWorkerPath();
		if (!workerPath) {
			// Fall back to in-process execution (e.g., during testing with ts-node/vitest)
			useInProcessFallback = true;
			return null;
		}
		worker = new Worker(workerPath);

		worker.on("message", (response: WorkerResponse) => {
			const pending = pendingRequests.get(response.id);
			if (pending) {
				pendingRequests.delete(response.id);
				if (response.success) {
					pending.resolve(response.result);
				} else {
					pending.reject(new Error(response.error));
				}
			}
		});

		worker.on("error", (error) => {
			for (const pending of pendingRequests.values()) {
				pending.reject(error);
			}
			pendingRequests.clear();
			worker = null;
		});

		worker.on("exit", (code) => {
			if (code !== 0) {
				const error = new Error(`Worker exited with code ${code}`);
				for (const pending of pendingRequests.values()) {
					pending.reject(error);
				}
				pendingRequests.clear();
			}
			worker = null;
		});
	}
	return worker;
}

async function sendRequest<T>(type: WorkerRequest["type"], payload: WorkerRequest["payload"]): Promise<T> {
	const workerInstance = getWorker();

	// Fallback to in-process execution if worker not available
	if (!workerInstance) {
		const { runComparison } = await import("./comparators");
		const { loadPNG, normalizeImageInput } = await import("./image-io");

		switch (type) {
			case "normalize":
				return normalizeImageInput((payload as { input: ImageInput }).input) as Promise<T>;
			case "loadPNG":
				return loadPNG((payload as { filePath: string }).filePath) as Promise<T>;
			case "compare": {
				const p = payload as {
					received: ImageData;
					baseline: ImageInput;
					method: ComparisonMethod;
					options: MatcherOptions;
					diffOutputPath?: string;
				};
				return runComparison(p.received, p.baseline, p.method, p.options, p.diffOutputPath) as Promise<T>;
			}
			default:
				throw new Error(`Unknown request type: ${type}`);
		}
	}

	return new Promise((resolve, reject) => {
		const id = ++requestId;
		pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

		const request: WorkerRequest = { id, type, payload };
		workerInstance.postMessage(request);
	});
}

/**
 * Ensure ImageData has proper Uint8Array after crossing worker boundary.
 * Structured clone can sometimes produce array-like objects that need reconstruction.
 */
function ensureImageData(result: ImageData): ImageData {
	if (result.data instanceof Uint8Array) {
		return result;
	}
	// Reconstruct Uint8Array if it was converted to plain object/array
	return {
		data: new Uint8Array(result.data),
		width: result.width,
		height: result.height,
	};
}

export async function normalizeInWorker(input: ImageInput): Promise<ImageData> {
	const result = await sendRequest<ImageData>("normalize", { input });
	return ensureImageData(result);
}

export async function loadPNGInWorker(filePath: string): Promise<ImageData> {
	const result = await sendRequest<ImageData>("loadPNG", { filePath });
	return ensureImageData(result);
}

export function compareInWorker(
	received: ImageData,
	baseline: ImageInput,
	method: ComparisonMethod,
	options: MatcherOptions,
	diffOutputPath?: string,
): Promise<RunComparisonResult> {
	// Ensure received data is a proper Uint8Array before sending to worker
	const normalizedReceived = ensureImageData(received);
	return sendRequest<RunComparisonResult>("compare", {
		received: normalizedReceived,
		baseline,
		method,
		options,
		diffOutputPath,
	});
}

export function terminateWorker(): Promise<number> {
	if (worker) {
		const w = worker;
		worker = null;
		return w.terminate();
	}
	return Promise.resolve(0);
}
