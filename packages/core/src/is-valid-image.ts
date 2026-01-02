import type { Image } from "./types";

/** Check if array is valid pixel data */
export function isValidImage(arr: unknown): arr is Image["data"] {
	// work around instanceof Uint8Array not working properly in some Jest environments
	return ArrayBuffer.isView(arr) && (arr as any).BYTES_PER_ELEMENT === 1;
}
