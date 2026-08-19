import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import type { SsimResult } from "./index";

export const FIXTURES = join(__dirname, "../../../../fixtures/blazediff");

export interface DecodedImage {
	data: Buffer;
	width: number;
	height: number;
}

export function decode(file: string): DecodedImage {
	const png = PNG.sync.read(readFileSync(file));
	return { data: png.data, width: png.width, height: png.height };
}

export function decodeFixture(name: string): DecodedImage {
	return decode(join(FIXTURES, name));
}

/**
 * Narrow to the scored variants of {@link SsimResult}.
 *
 * `layout-diff` and `file-not-exists` carry no score, so reading one off the
 * union needs a guard; tests that expect a score want to fail loudly rather
 * than compare against `undefined`.
 */
export function scored(result: SsimResult): number {
	if ("score" in result) return result.score;
	throw new Error(`expected a scored result, got ${JSON.stringify(result)}`);
}
