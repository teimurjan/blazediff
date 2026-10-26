import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** RGBA8 pixels, 4 bytes per pixel, row-major. */
export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

export type Filter = "none" | "sub" | "up" | "average" | "paeth" | "adaptive";

export interface EncodeOptions {
	/**
	 * 0 writes stored (uncompressed) deflate blocks, the fastest encode; 1-12
	 * are libdeflate levels. Default: 4.
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

/** Native binding interface */
interface NativeBinding {
	decode(png: Uint8Array): { data: Buffer; width: number; height: number };
	encode(
		rgba: Uint8Array,
		width: number,
		height: number,
		options: EncodeOptions | null,
	): Buffer;
}

const PLATFORM_PACKAGES: Record<
	string,
	{ packageName: string; packageDir: string }
> = {
	"darwin-arm64": {
		packageName: "@blazediff/codec-png-native-darwin-arm64",
		packageDir: "codec-png-native-darwin-arm64",
	},
	"darwin-x64": {
		packageName: "@blazediff/codec-png-native-darwin-x64",
		packageDir: "codec-png-native-darwin-x64",
	},
	"linux-arm64": {
		packageName: "@blazediff/codec-png-native-linux-arm64",
		packageDir: "codec-png-native-linux-arm64",
	},
	"linux-x64": {
		packageName: "@blazediff/codec-png-native-linux-x64",
		packageDir: "codec-png-native-linux-x64",
	},
	"win32-arm64": {
		packageName: "@blazediff/codec-png-native-win32-arm64",
		packageDir: "codec-png-native-win32-arm64",
	},
	"win32-x64": {
		packageName: "@blazediff/codec-png-native-win32-x64",
		packageDir: "codec-png-native-win32-x64",
	},
};

let nativeBinding: NativeBinding | null = null;
let nativeBindingAttempted = false;

/** Load the platform's N-API binding, or return null if there isn't one. */
function tryLoadNativeBinding(): NativeBinding | null {
	if (nativeBindingAttempted) {
		return nativeBinding;
	}
	nativeBindingAttempted = true;

	const key = `${os.platform()}-${os.arch()}`;
	const platformInfo = PLATFORM_PACKAGES[key];
	if (!platformInfo) {
		return null;
	}

	// createRequire rejects a non-file URL, which is what `import.meta.url` is
	// for a JSR consumer importing this over https. That is "no native binding
	// here", not a crash: `hasNativeBinding()` promises a boolean.
	let require: ReturnType<typeof createRequire>;
	try {
		require = createRequire(import.meta.url);
	} catch {
		return null;
	}

	try {
		const binding = require(platformInfo.packageName) as NativeBinding;
		if (typeof binding?.decode === "function") {
			nativeBinding = binding;
			return binding;
		}
	} catch {
		// Optional dependency missing for this platform; try the sibling below.
	}

	// Sibling package fallback, for monorepo development where the optional
	// dependencies are never installed from the registry.
	try {
		const currentDir = path.dirname(fileURLToPath(import.meta.url));
		const packagesDir = path.resolve(currentDir, "..", "..");
		const nodePath = path.join(
			packagesDir,
			platformInfo.packageDir,
			"blazediff_png.node",
		);
		if (existsSync(nodePath)) {
			const binding = require(nodePath) as NativeBinding;
			if (typeof binding?.decode === "function") {
				nativeBinding = binding;
				return binding;
			}
		}
	} catch {
		// Fallback also failed.
	}

	return null;
}

function requireBinding(): NativeBinding {
	const binding = tryLoadNativeBinding();
	if (binding) return binding;

	const key = `${os.platform()}-${os.arch()}`;
	if (!PLATFORM_PACKAGES[key]) {
		throw new Error(
			`Unsupported platform: ${key}. Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`,
		);
	}
	throw new Error(
		`Platform package ${PLATFORM_PACKAGES[key].packageName} is not installed. ` +
			`This usually means the optional dependency wasn't installed for your platform. ` +
			`Try reinstalling with: npm install @blazediff/codec-png-native`,
	);
}

/** Decode PNG bytes to RGBA8. Every PNG format is supported, including 16-bit, palette and interlaced files. */
export function decode(png: Uint8Array): Image {
	return requireBinding().decode(png);
}

/** Encode RGBA8 pixels as a PNG. */
export function encode(image: Image, options?: EncodeOptions): Uint8Array {
	const { data, width, height } = image;
	const rgba =
		data instanceof Uint8Array
			? data
			: new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
	return requireBinding().encode(rgba, width, height, options ?? null);
}

async function read(input: string | Buffer): Promise<Image> {
	try {
		const bytes = typeof input === "string" ? await readFile(input) : input;
		return decode(bytes);
	} catch (error) {
		throw new Error(`Failed to read PNG file ${input}: ${error}`);
	}
}

async function write(image: Image, output: string): Promise<void> {
	try {
		await writeFile(output, encode(image));
	} catch (error) {
		throw new Error(`Failed to write PNG file ${output}: ${error}`);
	}
}

/** The blazediff codec interface, the same shape as `@blazediff/codec-pngjs`. */
export const codecPngNative = {
	read,
	write,
};

/**
 * Check if the native N-API binding is available.
 * Returns true if the native module loaded successfully.
 */
export function hasNativeBinding(): boolean {
	return tryLoadNativeBinding() !== null;
}

export default codecPngNative;
