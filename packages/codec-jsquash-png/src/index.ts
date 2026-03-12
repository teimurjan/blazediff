import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

interface JsquashImageData {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

type DecodeFn = (data: ArrayBuffer) => Promise<JsquashImageData>;
type EncodeFn = (
	data: JsquashImageData & { colorSpace: string },
) => Promise<ArrayBuffer>;

let initPromise: Promise<{ decode: DecodeFn; encode: EncodeFn }> | null = null;

function loadCodec() {
	if (initPromise) return initPromise;

	initPromise = (async () => {
		const pkgDir = dirname(require.resolve("@jsquash/png"));
		const wasmPath = join(pkgDir, "codec", "pkg", "squoosh_png_bg.wasm");
		const wasmBuf = readFileSync(wasmPath);

		const decodeModule = await import("@jsquash/png/decode.js");
		const encodeModule = await import("@jsquash/png/encode.js");

		await Promise.all([decodeModule.init(wasmBuf), encodeModule.init(wasmBuf)]);

		return {
			decode: decodeModule.default as DecodeFn,
			encode: encodeModule.default as EncodeFn,
		};
	})();

	return initPromise;
}

async function read(input: string | Buffer): Promise<Image> {
	try {
		const { decode } = await loadCodec();

		const buffer = typeof input === "string" ? readFileSync(input) : input;
		const arrayBuffer = new Uint8Array(buffer).buffer;
		const imageData = await decode(arrayBuffer);

		return {
			data: imageData.data,
			width: imageData.width,
			height: imageData.height,
		};
	} catch (error) {
		throw new Error(`Failed to read PNG file ${input}: ${error}`);
	}
}

async function write(image: Image, output: string | Buffer): Promise<void> {
	try {
		const { encode } = await loadCodec();

		const imageData = {
			data: new Uint8ClampedArray(
				image.data.buffer,
				image.data.byteOffset,
				image.data.byteLength,
			),
			width: image.width,
			height: image.height,
			colorSpace: "srgb",
		};

		const encoded = await encode(imageData);
		writeFileSync(output, Buffer.from(encoded));
	} catch (error) {
		throw new Error(`Failed to write PNG file ${output}: ${error}`);
	}
}

export const codecJsquashPng = {
	read,
	write,
};

export default codecJsquashPng;
