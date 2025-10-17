export interface Image {
	data: Buffer | Uint8Array | Uint8ClampedArray;
	width: number;
	height: number;
}

/**
 * Convert RGBA to luma using BT.601 coefficients: Y = 0.299R + 0.587G + 0.114B
 * Using integer arithmetic for speed: Y = (77R + 150G + 29B) >> 8
 */
export function rgbaToLuma(
	rgba: Image["data"],
	luma: Uint8Array,
	width: number,
	height: number,
): void {
	const len = width * height;
	for (let i = 0; i < len; i++) {
		const idx = i * 4;
		const r = rgba[idx];
		const g = rgba[idx + 1];
		const b = rgba[idx + 2];
		// Y = (77R + 150G + 29B) >> 8
		luma[i] = (77 * r + 150 * g + 29 * b) >> 8;
	}
}

/**
 * Compute gradient magnitudes squared using Prewitt operator (3x3)
 * Returns grad^2 = Gx^2 + Gy^2 for each pixel (excluding 1px border)
 *
 * Note: Original GMSD paper uses Prewitt operator divided by 3:
 * dx = [1 0 -1; 1 0 -1; 1 0 -1]/3
 * dy = dx'
 */
export function computeGradientMagnitudesSquared(
	luma: Uint8Array,
	width: number,
	height: number,
): Uint32Array {
	const grad2 = new Uint32Array(width * height);

	// Process interior pixels (1px border excluded)
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const idx = y * width + x;

			// Fetch 3x3 neighborhood
			const tl = luma[(y - 1) * width + (x - 1)];
			const tc = luma[(y - 1) * width + x];
			const tr = luma[(y - 1) * width + (x + 1)];
			const ml = luma[y * width + (x - 1)];
			const mr = luma[y * width + (x + 1)];
			const bl = luma[(y + 1) * width + (x - 1)];
			const bc = luma[(y + 1) * width + x];
			const br = luma[(y + 1) * width + (x + 1)];

			// Prewitt Gx = [1 0 -1; 1 0 -1; 1 0 -1]/3
			const gx = (tl + ml + bl - tr - mr - br) / 3;

			// Prewitt Gy = [1 1 1; 0 0 0; -1 -1 -1]/3
			const gy = (tl + tc + tr - bl - bc - br) / 3;

			grad2[idx] = gx * gx + gy * gy;
		}
	}

	return grad2;
}

/**
 * Compute per-pixel gradient magnitude similarity (GMS)
 * Formula: GMS = (2 * sqrt(ga2 * gb2) + C) / (ga2 + gb2 + C)
 */
export function computeSimilarity(
	grad1: Uint32Array,
	grad2: Uint32Array,
	c: number,
	width: number,
	height: number,
): Float32Array {
	const validPixels: number[] = [];

	// Only process interior pixels (1px border excluded)
	for (let y = 1; y < height - 1; y++) {
		for (let x = 1; x < width - 1; x++) {
			const i = y * width + x;
			const ga2 = grad1[i];
			const gb2 = grad2[i];

			// GMS formula: (2 * sqrt(ga2 * gb2) + C) / (ga2 + gb2 + C)
			const numerator = 2 * Math.sqrt(ga2) * Math.sqrt(gb2) + c;
			const denominator = ga2 + gb2 + c;

			validPixels.push(numerator / denominator);
		}
	}

	return new Float32Array(validPixels);
}

/**
 * Compute standard deviation of similarity values
 */
export function computeStdDev(values: Float32Array): number {
	const len = values.length;
	if (len === 0) return 0;

	// Compute mean
	let sum = 0;
	for (let i = 0; i < len; i++) {
		sum += values[i];
	}
	const mean = sum / len;

	// Compute variance
	let variance = 0;
	for (let i = 0; i < len; i++) {
		const diff = values[i] - mean;
		variance += diff * diff;
	}
	variance /= len;

	return Math.sqrt(variance);
}
