/**
 * Convert RGBA image data to grayscale using the same coefficients as MATLAB/Octave
 * Y = 0.298936*R + 0.587043*G + 0.114021*B
 *
 * These coefficients correspond to the luminance channel when RGB is translated to YIQ
 * and match MATLAB/Octave's rgb2gray function exactly.
 *
 * Uses Float32Array for better performance in subsequent SSIM calculations
 */
export default function rgbaToGrayscale(
	rgba: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
): Float32Array {
	const grayscale = new Float32Array(width * height);
	let grayIdx = 0;

	for (let i = 0; i < rgba.length; i += 4) {
		const r = rgba[i];
		const g = rgba[i + 1];
		const b = rgba[i + 2];

		// MATLAB/Octave rgb2gray coefficients (YIQ luminance)
		grayscale[grayIdx++] = 0.298936 * r + 0.587043 * g + 0.114021 * b;
	}

	return grayscale;
}
