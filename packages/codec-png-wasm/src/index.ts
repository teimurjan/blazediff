import init, {
	decode as wasmDecode,
	encode as wasmEncode,
} from "../wasm/blazediff_png.js";

/** RGBA8 pixels, 4 bytes per pixel, row-major. */
export interface Image {
	data: Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export type Filter = "none" | "sub" | "up" | "average" | "paeth" | "adaptive";

export interface EncodeOptions {
	/**
	 * 0 writes stored (uncompressed) deflate blocks, the fastest encode. 1-12
	 * compress; in wasm every level from 1 up runs the same fast fdeflate mode.
	 * Default: 4.
	 */
	compression?: number;
	/** Row filter. Default: "adaptive", which picks the best filter per row. */
	filter?: Filter;
	/**
	 * "auto" writes the smallest lossless color mode, for example dropping an
	 * alpha channel that is fully opaque. "rgba8" skips that scan and writes
	 * the pixels as given, which is faster. Default: "auto".
	 */
	color?: "auto" | "rgba8";
}

export type WasmInput =
	| RequestInfo
	| URL
	| Response
	| BufferSource
	| WebAssembly.Module;

const WASM_URL = new URL("../wasm/blazediff_png_bg.wasm", import.meta.url);

let initPromise: Promise<unknown> | undefined;

// The glue fetches its module from `import.meta.url`, which Node's `fetch`
// cannot do for `file://`, so Node reads the bytes from disk instead.
async function defaultInput(): Promise<WasmInput | undefined> {
	const isNode =
		typeof process !== "undefined" && Boolean(process.versions?.node);
	if (!isNode || WASM_URL.protocol !== "file:") return undefined;
	const { readFile } = await import("node:fs/promises");
	return readFile(WASM_URL);
}

/**
 * Initialize the wasm module. Safe to call multiple times: later calls return
 * the same promise. By default it loads the bundled `blazediff_png_bg.wasm`.
 * Pass a `URL`, `Response` or bytes to load it from somewhere else.
 */
export function initCodecPngWasm(input?: WasmInput): Promise<void> {
	if (!initPromise) {
		initPromise = (input ? Promise.resolve(input) : defaultInput()).then(
			(source) =>
				init(
					source === undefined
						? undefined
						: ({ module_or_path: source } as never),
				),
		);
	}
	return initPromise.then(() => undefined);
}

/** Decode PNG bytes to RGBA8. Every PNG format is supported, including 16-bit, palette and interlaced files. */
export async function decode(png: Uint8Array): Promise<Image> {
	await initCodecPngWasm();
	const decoded = wasmDecode(png);
	const { width, height } = decoded;
	return { data: decoded.takeData(), width, height };
}

/** Encode RGBA8 pixels as a PNG. */
export async function encode(
	image: Image,
	options: EncodeOptions = {},
): Promise<Uint8Array> {
	await initCodecPngWasm();
	const { data, width, height } = image;
	const rgba =
		data instanceof Uint8Array
			? data
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return wasmEncode(
		rgba,
		width,
		height,
		options.compression,
		options.filter,
		options.color,
	);
}

async function read(input: string | Uint8Array): Promise<Image> {
	try {
		const bytes =
			typeof input === "string"
				? await (await import("node:fs/promises")).readFile(input)
				: input;
		return await decode(bytes);
	} catch (error) {
		throw new Error(`Failed to read PNG file ${input}: ${error}`);
	}
}

async function write(image: Image, output: string): Promise<void> {
	try {
		const { writeFile } = await import("node:fs/promises");
		await writeFile(output, await encode(image));
	} catch (error) {
		throw new Error(`Failed to write PNG file ${output}: ${error}`);
	}
}

/**
 * The blazediff codec interface, the same shape as `@blazediff/codec-pngjs`.
 * File paths need a runtime with `node:fs`; in a browser, pass bytes to
 * `read` or call {@link decode} and {@link encode} directly.
 */
export const codecPngWasm = {
	read,
	write,
};

export default codecPngWasm;
