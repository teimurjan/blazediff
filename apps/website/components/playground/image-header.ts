// Format and size straight from the file header, so the picker can check a
// pair before anything is decoded.

export interface Size {
	width: number;
	height: number;
}

export type ImageType = "image/png" | "image/jpeg" | "image/webp";

export interface ImageHeader {
	type: ImageType;
	size: Size;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
	signature.every((byte, i) => bytes[offset + i] === byte);

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
	String.fromCharCode(...bytes.subarray(offset, offset + length));

/** The format comes from the bytes, since a file name or MIME type can lie. */
export function sniffType(bytes: Uint8Array): ImageType | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
		return "image/png";
	}
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
	if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
		return "image/webp";
	}
	return null;
}

function pngSize(view: DataView): Size | null {
	if (view.byteLength < 24) return null;
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** Walks the marker segments up to the first start-of-frame. */
function jpegSize(bytes: Uint8Array, view: DataView): Size | null {
	let offset = 2;
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) return null;
		const marker = bytes[offset + 1];
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		// SOF0-SOF15, minus DHT (C4), JPG (C8) and DAC (CC), which share the range.
		const isFrame =
			marker >= 0xc0 &&
			marker <= 0xcf &&
			marker !== 0xc4 &&
			marker !== 0xc8 &&
			marker !== 0xcc;
		if (isFrame) {
			return {
				height: view.getUint16(offset + 5),
				width: view.getUint16(offset + 7),
			};
		}
		offset += 2 + view.getUint16(offset + 2);
	}
	return null;
}

const uint24le = (bytes: Uint8Array, offset: number) =>
	bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

function webpSize(bytes: Uint8Array, view: DataView): Size | null {
	if (bytes.length < 30) return null;
	switch (ascii(bytes, 12, 4)) {
		case "VP8 ":
			return {
				width: view.getUint16(26, true) & 0x3fff,
				height: view.getUint16(28, true) & 0x3fff,
			};
		case "VP8L": {
			const [b0, b1, b2, b3] = bytes.subarray(21, 25);
			return {
				width: 1 + (((b1 & 0x3f) << 8) | b0),
				height: 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)),
			};
		}
		case "VP8X":
			return {
				width: 1 + uint24le(bytes, 24),
				height: 1 + uint24le(bytes, 27),
			};
		default:
			return null;
	}
}

export function readHeader(bytes: Uint8Array): ImageHeader | null {
	const type = sniffType(bytes);
	if (!type) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const size =
		type === "image/png"
			? pngSize(view)
			: type === "image/jpeg"
				? jpegSize(bytes, view)
				: webpSize(bytes, view);
	return size ? { type, size } : null;
}

/** JPEG frame headers can sit behind large EXIF or XMP blocks; this covers nearly all. */
const HEADER_BYTES = 512 * 1024;

export async function readBlobHeader(blob: Blob): Promise<ImageHeader | null> {
	const head = new Uint8Array(await blob.slice(0, HEADER_BYTES).arrayBuffer());
	const header = readHeader(head);
	if (header || blob.size <= HEADER_BYTES) return header;
	return readHeader(new Uint8Array(await blob.arrayBuffer()));
}
