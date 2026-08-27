/// <reference lib="webworker" />

// Fetching, decoding and interpreting all happen here so the ~236 MB RGBA
// buffers a large fixture produces never cross to the main thread, and so the
// several seconds of classification never block paint.

import {
	type InterpretResult,
	initInterpret,
	interpret,
} from "@blazediff/interpret-wasm";

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

/**
 * Browsers cap canvas *area*, and iOS Safari's cap is roughly this. Past it the
 * canvas fallback silently produces a blank or throws something opaque, so fail
 * with a sentence the reader can act on instead.
 */
const CANVAS_AREA_LIMIT = 16.7e6;

const post = (message: InterpretResponse) => self.postMessage(message);

function mimeOf(url: string): string {
	return url.endsWith(".jpg") || url.endsWith(".jpeg")
		? "image/jpeg"
		: "image/png";
}

/**
 * `ImageDecoder` first: it has no canvas area cap, which is the only way the
 * `page` and `4k-jpeg` fixtures decode at all. Chromium and Firefox have it;
 * Safari falls through to the canvas path.
 */
async function decodeRgba(
	bytes: ArrayBuffer,
	type: string,
): Promise<Uint8Array> {
	if (
		typeof ImageDecoder !== "undefined" &&
		(await ImageDecoder.isTypeSupported(type))
	) {
		const decoder = new ImageDecoder({ data: bytes, type });
		const { image } = await decoder.decode();
		try {
			const buffer = new Uint8Array(image.allocationSize({ format: "RGBA" }));
			await image.copyTo(buffer, { format: "RGBA" });
			return buffer;
		} finally {
			image.close();
			decoder.close();
		}
	}

	const bitmap = await createImageBitmap(new Blob([bytes], { type }));
	try {
		const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("could not get a 2d canvas context");
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
		return new Uint8Array(data.buffer);
	} finally {
		bitmap.close();
	}
}

/**
 * Hand `initInterpret` a `Response` so it can still stream-compile, but check
 * the status first: passing a failed response straight through means the CDN's
 * error page reaches the wasm instantiator, which reports it as
 * "expected magic word 00 61 73 6d" rather than as the 404 it is.
 */
async function fetchWasm(url: string): Promise<Response> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`could not load the interpret wasm module (HTTP ${response.status} from ${url})`,
		);
	}
	return response;
}

async function fetchBytes(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`could not fetch ${url} (HTTP ${response.status})`);
	}
	return response.arrayBuffer();
}

self.onmessage = async (event: MessageEvent<InterpretRequest>) => {
	const { a, b, width, height, wasmUrl } = event.data;

	try {
		if (
			typeof ImageDecoder === "undefined" &&
			width * height > CANVAS_AREA_LIMIT
		) {
			throw new Error(
				`Your browser cannot decode a ${width}×${height} image (canvas size limit). Try Chrome or Firefox, or pick a smaller pair.`,
			);
		}

		post({ type: "phase", phase: "fetching" });
		const [bytesA, bytesB] = await Promise.all([fetchBytes(a), fetchBytes(b)]);

		post({ type: "phase", phase: "decoding" });
		const [dataA, dataB] = await Promise.all([
			decodeRgba(bytesA, mimeOf(a)),
			decodeRgba(bytesB, mimeOf(b)),
		]);

		post({ type: "phase", phase: "analyzing" });
		await initInterpret(await fetchWasm(wasmUrl));
		const result = await interpret(dataA, dataB, width, height);

		post({ type: "done", result });
	} catch (error) {
		post({
			type: "error",
			message: error instanceof Error ? error.message : String(error),
		});
	}
};
