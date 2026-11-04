/** Pixel buffer accepted by every entry point (Node `Buffer` is a Uint8Array). */
export type PixelData = Uint8Array | Uint8ClampedArray;

/** Rec. 601 luma weights, shared by the YIQ metric, the AA detector and the gray fill. */
export const YIQ_Y_R = 0.29889531;
export const YIQ_Y_G = 0.58662247;
export const YIQ_Y_B = 0.11448223;

/** YIQ chroma coefficients and per-axis weights of the YIQ color metric. */
export const YIQ_I_R = 0.59597799;
export const YIQ_I_G = -0.2741761;
export const YIQ_I_B = -0.32180189;
export const YIQ_Q_R = 0.21147017;
export const YIQ_Q_G = -0.52261711;
export const YIQ_Q_B = 0.31114694;
export const YIQ_COEFF_Y = 0.5053;
export const YIQ_COEFF_I = 0.299;
export const YIQ_COEFF_Q = 0.1957;

/**
 * Largest eigenvalue of the YIQ metric's quadratic form.
 *
 * The metric is δ = 0.5053ΔY² + 0.299ΔI² + 0.1957ΔQ², where ΔY/ΔI/ΔQ are
 * linear in the channel deltas v = (Δr, Δg, Δb). That makes δ = vᵀMv for a
 * symmetric positive-definite M, so δ ≤ λmax·|v|² for every v. Therefore
 *
 *     Δr² + Δg² + Δb² ≤ maxDelta / λmax   ⟹   δ ≤ maxDelta
 *
 * i.e. any pixel under that bound is *provably* below threshold and can skip
 * the full metric: three integer multiplies instead of twelve float ones.
 * Deltas are integers in [-255, 255], so |v|² ≤ 195075 is computed exactly in
 * a double; the bound introduces no rounding of its own.
 *
 * The true λmax is 0.2560781412378786 and the worst ratio over all 511³
 * integer deltas is 0.2560781281866944. The value below is rounded *up* from
 * both so the one division (maxDelta / λmax) can only ever shrink the reject
 * window, never widen it past the real boundary.
 *
 * Verified exhaustively: across all 133,432,830 integer delta triples and
 * thresholds 0.001–1.0, zero pixels are rejected that the full metric would
 * have counted as different.
 */
export const YIQ_LAMBDA_MAX = 0.2560782;

/**
 * RGBA bytes sit in memory in R,G,B,A order on every platform, but reading a
 * pixel as one 32-bit word puts red in the low byte on little-endian CPUs and
 * in the high byte on big-endian ones. These shifts let the hot loops pull
 * channels out of the word they already loaded for the equality test (no
 * extra memory traffic) while staying correct on both.
 *
 * They are module-level constants, so V8 hoists them out of the loops.
 */
export const LITTLE_ENDIAN =
	new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
export const SHIFT_R = LITTLE_ENDIAN ? 0 : 24;
export const SHIFT_G = LITTLE_ENDIAN ? 8 : 16;
export const SHIFT_B = LITTLE_ENDIAN ? 16 : 8;
export const SHIFT_A = LITTLE_ENDIAN ? 24 : 0;
