// Decoding and fetching shared by the analysis workers. Everything here runs
// off the main thread, so the large RGBA buffers never reach it.

export interface DecodedImage {
	data: Uint8Array;
	width: number;
	height: number;
}

/**
 * Browsers cap canvas *area*, and iOS Safari's cap is roughly this. Past it the
 * canvas fallback silently produces a blank or throws something opaque, so fail
 * with a sentence the reader can act on instead.
 */
export const CANVAS_AREA_LIMIT = 16.7e6;

export function canvasLimitError(width: number, height: number): Error {
	return new Error(
		`Your browser cannot decode a ${width}×${height} image (canvas size limit). Try Chrome or Firefox, or use a smaller image.`,
	);
}

/**
 * `ImageDecoder` first: it has no canvas area cap, which is the only way the
 * `page` and `4k-jpeg` fixtures decode at all. Chromium and Firefox have it;
 * Safari falls through to the canvas path.
 */
export async function decodeRgba(
	bytes: ArrayBuffer,
	type: string,
): Promise<DecodedImage> {
	if (
		typeof ImageDecoder !== "undefined" &&
		(await ImageDecoder.isTypeSupported(type))
	) {
		const decoder = new ImageDecoder({ data: bytes, type });
		const { image } = await decoder.decode();
		try {
			const data = new Uint8Array(image.allocationSize({ format: "RGBA" }));
			await image.copyTo(data, { format: "RGBA" });
			const width = image.visibleRect?.width ?? image.codedWidth;
			const height = image.visibleRect?.height ?? image.codedHeight;
			return { data, width, height };
		} finally {
			image.close();
			decoder.close();
		}
	}

	const bitmap = await createImageBitmap(new Blob([bytes], { type }));
	try {
		const { width, height } = bitmap;
		if (width * height > CANVAS_AREA_LIMIT) {
			throw canvasLimitError(width, height);
		}
		const canvas = new OffscreenCanvas(width, height);
		const context = canvas.getContext("2d");
		if (!context) throw new Error("could not get a 2d canvas context");
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(0, 0, width, height);
		return { data: new Uint8Array(data.buffer), width, height };
	} finally {
		bitmap.close();
	}
}

/**
 * Hand a wasm init a `Response` so it can still stream-compile, but check the
 * status first: passing a failed response straight through means the CDN's
 * error page reaches the wasm instantiator, which reports it as
 * "expected magic word 00 61 73 6d" rather than as the 404 it is.
 */
export async function fetchWasm(url: string): Promise<Response> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`could not load a wasm module (HTTP ${response.status} from ${url})`,
		);
	}
	return response;
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`could not fetch ${url} (HTTP ${response.status})`);
	}
	return response.arrayBuffer();
}
