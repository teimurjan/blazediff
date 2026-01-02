import type { Image } from "./types";

/**
 * Calculate color difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function colorDelta(
	image1: Image["data"],
	image2: Image["data"],
	k: number,
	m: number,
): number {
	const r1 = image1[k];
	const g1 = image1[k + 1];
	const b1 = image1[k + 2];
	const a1 = image1[k + 3];
	const r2 = image2[m];
	const g2 = image2[m + 1];
	const b2 = image2[m + 2];
	const a2 = image2[m + 3];

	let dr = r1 - r2;
	let dg = g1 - g2;
	let db = b1 - b2;
	const da = a1 - a2;

	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// blend pixels with background
		const rb = 48 + 159 * (k % 2);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

	const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
	const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

	const delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

	// encode whether the pixel lightens or darkens in the sign
	return y > 0 ? -delta : delta;
}

/**
 * Calculate brightness difference according to the paper "Measuring perceived color difference
 * using YIQ NTSC transmission color space in mobile applications" by Y. Kotsarenko and F. Ramos
 *
 * https://doaj.org/article/b2e3b5088ba943eebd9af2927fef08ad
 */
export function brightnessDelta(
	image1: Image["data"],
	image2: Image["data"],
	k: number,
	m: number,
): number {
	const r1 = image1[k];
	const g1 = image1[k + 1];
	const b1 = image1[k + 2];
	const a1 = image1[k + 3];
	const r2 = image2[m];
	const g2 = image2[m + 1];
	const b2 = image2[m + 2];
	const a2 = image2[m + 3];

	let dr = r1 - r2;
	let dg = g1 - g2;
	let db = b1 - b2;
	const da = a1 - a2;

	// same as in colorDelta
	if (!dr && !dg && !db && !da) return 0;

	if (a1 < 255 || a2 < 255) {
		// *** EXACT COPY of your alpha+bg code ***
		const rb = 48 + 159 * (k % 2);
		const gb = 48 + 159 * (((k / 1.618033988749895) | 0) & 1);
		const bb = 48 + 159 * (((k / 2.618033988749895) | 0) & 1);
		dr = (r1 * a1 - r2 * a2 - rb * da) / 255;
		dg = (g1 * a1 - g2 * a2 - gb * da) / 255;
		db = (b1 * a1 - b2 * a2 - bb * da) / 255;
	}

	// same y as in colorDelta
	const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

	return y;
}
