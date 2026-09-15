/**
 * `local` judge on `moondream-3-9b-mlx`: Moondream 3 read over HTTP from a
 * locally managed Moondream Station, which reaches Apple Silicon's GPU — a
 * region read costs ~2s against ~11s for the in-process ONNX model.
 *
 * onnxruntime-node has no working GPU path for Moondream (fp16 fails to load,
 * CoreML is slower on the vision encoder and rejects the decoder's empty KV
 * cache outright), so the only way to the GPU is to let Station host the weights.
 * `station.ts` owns that process; this module owns the conversation with it.
 * Prompts, region diffing and the Qwen classifier are shared with the ONNX judge.
 */

import { readFile } from "node:fs/promises";
import { createLocalJudge } from "./local";
import { startStation } from "./station";
import type { Judge } from "./types";
import { createVisionRunnerHolder, type VisionRunner } from "./vision";

const REQUEST_TIMEOUT_MS = 120_000;

interface QueryResponse {
	answer?: string;
	error?: string;
}

async function toDataUrl(imagePath: string): Promise<string> {
	const bytes = await readFile(imagePath);
	return `data:image/png;base64,${bytes.toString("base64")}`;
}

/**
 * Build a runner backed by Station's REST API. There is no model to load, so
 * the holder's `get()` resolves immediately and every call is a single request.
 */
export function createStationVisionRunner(endpoint: string): VisionRunner {
	const queryUrl = `${endpoint.replace(/\/+$/, "")}/query`;

	return {
		async describe(imagePath: string, question: string): Promise<string> {
			const response = await fetch(queryUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					image_url: await toDataUrl(imagePath),
					question,
					stream: false,
				}),
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
			});

			if (!response.ok) {
				throw new Error(
					`moondream station returned ${response.status} for ${queryUrl}`,
				);
			}

			const payload = (await response.json()) as QueryResponse;
			if (payload.error) {
				throw new Error(`moondream station: ${payload.error}`);
			}
			return (payload.answer ?? "").trim();
		},
	};
}

export function createMlxLocalJudge(): Judge {
	const vision = createVisionRunnerHolder(async () => {
		const station = await startStation();
		return createStationVisionRunner(station.endpoint);
	});
	return createLocalJudge({ vision, name: "local:moondream-3-9b-mlx" });
}

/** Default singleton used by the CLI. Tests build their own via `createMlxLocalJudge`. */
export const mlxLocalJudge: Judge = createMlxLocalJudge();
