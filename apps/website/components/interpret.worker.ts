/// <reference lib="webworker" />

// Fetching, decoding and interpreting all happen here so the ~236 MB RGBA
// buffers a large fixture produces never cross to the main thread, and so the
// several seconds of classification never block paint.

import {
	type InterpretResult,
	initInterpret,
	interpret,
} from "@blazediff/interpret-wasm";
import {
	CANVAS_AREA_LIMIT,
	canvasLimitError,
	decodeRgba,
	fetchBytes,
	fetchWasm,
} from "./image-decode";

export interface InterpretRequest {
	a: string;
	b: string;
	width: number;
	height: number;
	/**
	 * Absolute URL of the wasm module, supplied by the caller.
	 *
	 * The glue's own `new URL(..., import.meta.url)` default does not work
	 * here: Turbopack rewrites it to a root-relative `/_next/static/media/...`,
	 * and this worker runs from a blob: URL, which gives a root-relative path
	 * nothing to resolve against. Taking the URL as input also keeps this
	 * worker a pure function of its message, with no build-time coupling.
	 */
	wasmUrl: string;
}

export type InterpretPhase = "fetching" | "decoding" | "analyzing";

export type InterpretResponse =
	| { type: "phase"; phase: InterpretPhase }
	| { type: "done"; result: InterpretResult }
	| { type: "error"; message: string };

const post = (message: InterpretResponse) => self.postMessage(message);

function mimeOf(url: string): string {
	return url.endsWith(".jpg") || url.endsWith(".jpeg")
		? "image/jpeg"
		: "image/png";
}

self.onmessage = async (event: MessageEvent<InterpretRequest>) => {
	const { a, b, width, height, wasmUrl } = event.data;

	try {
		if (
			typeof ImageDecoder === "undefined" &&
			width * height > CANVAS_AREA_LIMIT
		) {
			throw canvasLimitError(width, height);
		}

		post({ type: "phase", phase: "fetching" });
		const [bytesA, bytesB] = await Promise.all([fetchBytes(a), fetchBytes(b)]);

		post({ type: "phase", phase: "decoding" });
		const [imageA, imageB] = await Promise.all([
			decodeRgba(bytesA, mimeOf(a)),
			decodeRgba(bytesB, mimeOf(b)),
		]);

		post({ type: "phase", phase: "analyzing" });
		await initInterpret(await fetchWasm(wasmUrl));
		const result = await interpret(imageA.data, imageB.data, width, height);

		post({ type: "done", result });
	} catch (error) {
		post({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
