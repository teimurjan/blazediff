/**
 * OKLab HyAB color difference (pixelmatch 8 parity).
 *
 * Colors go through sRGB → linear → LMS → cube root, then are compared with
 * HyAB: |ΔLr| + √(Δa² + Δb²), where Lr is Ottosson's toe-corrected lightness.
 * Threshold 1 is black vs white. The math, tables and checkerboard match
 * pixelmatch 8 operation for operation, so diff counts are identical.
 */
import { LITTLE_ENDIAN, SHIFT_A, SHIFT_B, SHIFT_G, SHIFT_R } from "./pixel";

// sRGB byte -> linear, padded with a 257th entry for interpolation.
const LIN = new Float64Array(257);
for (let i = 0; i < 256; i++) {
	const c = i / 255;
	LIN[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
LIN[256] = LIN[255];

// Per-channel LMS contributions of an opaque sRGB byte.
const L_R = new Float64Array(256);
const L_G = new Float64Array(256);
const L_B = new Float64Array(256);
const M_R = new Float64Array(256);
const M_G = new Float64Array(256);
const M_B = new Float64Array(256);
const S_R = new Float64Array(256);
const S_G = new Float64Array(256);
const S_B = new Float64Array(256);
for (let i = 0; i < 256; i++) {
	const lin = LIN[i];
	L_R[i] = 0.4122214708 * lin;
	M_R[i] = 0.2119034982 * lin;
	S_R[i] = 0.0883024619 * lin;
	L_G[i] = 0.5363325363 * lin;
	M_G[i] = 0.6806995451 * lin;
	S_G[i] = 0.2817188376 * lin;
	L_B[i] = 0.0514459929 * lin;
	M_B[i] = 0.1073969566 * lin;
	S_B[i] = 0.6299787005 * lin;
}

const CBRT_N = 4096;
const CBRT = new Float64Array(CBRT_N + 2);
for (let i = 0; i <= CBRT_N + 1; i++) CBRT[i] = Math.cbrt(i / CBRT_N);
// Interpolation is off by up to 50% right above zero, so the first samples use Math.cbrt.
const CBRT_EXACT = 8;

const TOE_K1 = 0.206;
const TOE_K2 = 0.03;
const TOE_K3 = (1 + TOE_K1) / (1 + TOE_K2);

/**
 * Upper bound on the HyAB distance of one Chebyshev step (each channel moves
 * by at most 1) between opaque colors whose channels are all >= v, as
 * [v, bound] buckets rounded up. HyAB is a metric, so a pair d steps apart
 * with every channel >= v is within d * STEP_BOUND[v]. `oklab.test.ts`
 * re-derives the exact maxima over all 2^24 colors and checks these.
 */
const STEP_BOUND_BUCKETS: ReadonlyArray<readonly [number, number]> = [
	[0, 0.04467],
	[1, 0.02131],
	[2, 0.01534],
	[3, 0.01241],
	[4, 0.01076],
	[5, 0.009616],
	[6, 0.008663],
	[7, 0.008087],
	[8, 0.007591],
	[16, 0.007169],
	[32, 0.007152],
	[64, 0.006794],
	[128, 0.006148],
];
export const STEP_BOUND = new Float64Array(256);
for (const [start, bound] of STEP_BOUND_BUCKETS) STEP_BOUND.fill(bound, start);

/** Per-min-channel squared largest step count that is provably within `maxDelta`. */
export function stepLimits(maxDelta: number): Int32Array {
	const limits = new Int32Array(256);
	for (let v = 0; v < 256; v++) {
		const steps = Math.min(255, Math.floor(maxDelta / STEP_BOUND[v]));
		limits[v] = steps * steps;
	}
	return limits;
}

/**
 * True when two opaque words are provably within threshold: every channel
 * moves by at most √limits[v], v being the smallest of their six channels.
 * Squares and a sign test instead of Math.abs/Math.max, which V8 makes slow here.
 */
function withinStepBound(av: number, bv: number, limits: Int32Array): boolean {
	const r1 = (av >>> SHIFT_R) & 0xff;
	const g1 = (av >>> SHIFT_G) & 0xff;
	const b1 = (av >>> SHIFT_B) & 0xff;
	const r2 = (bv >>> SHIFT_R) & 0xff;
	const g2 = (bv >>> SHIFT_G) & 0xff;
	const b2 = (bv >>> SHIFT_B) & 0xff;
	const limit = limits[Math.min(r1, g1, b1, r2, g2, b2)];
	const dr = r1 - r2;
	const dg = g1 - g2;
	const db = b1 - b2;
	return ((limit - dr * dr) | (limit - dg * dg) | (limit - db * db)) >= 0;
}

// Direct-mapped cache: opaque RGB -> cube-rooted LMS + toe-corrected lightness.
// Keys are stored +1 so an empty slot (0) never matches.
const CACHE_BITS = 12;
const CACHE_SHIFT = 32 - CACHE_BITS;
const CACHE_KEYS = new Uint32Array(1 << CACHE_BITS);
const CACHE_VALUES = new Float64Array((1 << CACHE_BITS) * 4);
const RGB_MASK = LITTLE_ENDIAN ? 0x00ffffff : 0xffffff00;
const RGB_SHIFT = LITTLE_ENDIAN ? 0 : 8;

function linLut(x: number): number {
	const i = x | 0;
	return LIN[i] + (LIN[i + 1] - LIN[i]) * (x - i);
}

function cbrtLut(x: number): number {
	const t = x * CBRT_N;
	const i = t | 0;
	if (i < CBRT_EXACT) return Math.cbrt(x);
	return CBRT[i] + (CBRT[i + 1] - CBRT[i]) * (t - i);
}

function lightness(l: number, m: number, s: number): number {
	const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
	const x = TOE_K3 * L - TOE_K1;
	return 0.5 * (x + Math.sqrt(x * x + 4 * TOE_K2 * TOE_K3 * L));
}

/** Offset of `word`'s cached OKLab values in CACHE_VALUES, filling the slot on a miss. */
function cachedOffset(word: number): number {
	const key = (word & RGB_MASK) >>> RGB_SHIFT;
	const slot = Math.imul(key, 0x9e3779b1) >>> CACHE_SHIFT;
	const offset = slot << 2;
	if (CACHE_KEYS[slot] !== key + 1) {
		CACHE_KEYS[slot] = key + 1;
		writeOklab(
			(word >>> SHIFT_R) & 0xff,
			(word >>> SHIFT_G) & 0xff,
			(word >>> SHIFT_B) & 0xff,
			CACHE_VALUES,
			offset,
		);
	}
	return offset;
}

/** Writes an opaque color's cube-rooted l, m, s and toe-corrected lightness at `offset`. */
export function writeOklab(
	r: number,
	g: number,
	b: number,
	out: Float64Array,
	offset: number,
): void {
	const l = cbrtLut(L_R[r] + L_G[g] + L_B[b]);
	const m = cbrtLut(M_R[r] + M_G[g] + M_B[b]);
	const s = cbrtLut(S_R[r] + S_G[g] + S_B[b]);
	out[offset] = l;
	out[offset + 1] = m;
	out[offset + 2] = s;
	out[offset + 3] = lightness(l, m, s);
}

/**
 * HyAB threshold test without the sqrt: the distance is within `maxDelta` iff
 * |ΔLr| <= maxDelta and Δa² + Δb² <= (maxDelta − |ΔLr|)².
 * Returns 0 when within, otherwise -1 if img2 is darker and 1 if not.
 */
function hyab(
	dLr: number,
	dl: number,
	dm: number,
	ds: number,
	maxDelta: number,
): number {
	const rest = maxDelta - Math.abs(dLr);
	if (rest >= 0) {
		const da = 1.9779984951 * dl - 2.428592205 * dm + 0.4505937099 * ds;
		const db = 0.0259040371 * dl + 0.7827717662 * dm - 0.808675766 * ds;
		if (da * da + db * db <= rest * rest) return 0;
	}
	return dLr > 0 ? -1 : 1;
}

/** {@link hyab} verdict for two different, fully opaque pixel words. */
function opaqueDelta(av: number, bv: number, maxDelta: number): number {
	const o1 = cachedOffset(av);
	const l1 = CACHE_VALUES[o1];
	const m1 = CACHE_VALUES[o1 + 1];
	const s1 = CACHE_VALUES[o1 + 2];
	const lr1 = CACHE_VALUES[o1 + 3];
	// Read the first pixel before the second lookup: both may share a slot.
	const o2 = cachedOffset(bv);
	return hyab(
		lr1 - CACHE_VALUES[o2 + 3],
		l1 - CACHE_VALUES[o2],
		m1 - CACHE_VALUES[o2 + 1],
		s1 - CACHE_VALUES[o2 + 2],
		maxDelta,
	);
}

/**
 * {@link hyab} verdict for two different pixel words where at least one is
 * semi-transparent. Both are blended over one of 8 dark/light backgrounds
 * picked by a Fibonacci hash of the pixel index.
 */
function transparentDelta(
	av: number,
	bv: number,
	index: number,
	maxDelta: number,
): number {
	const h = Math.imul(index, 0x9e3779b1);
	const rb = 48 + 159 * (h >>> 31);
	const gb = 48 + 159 * ((h >>> 30) & 1);
	const bb = 48 + 159 * ((h >>> 29) & 1);
	const a1 = (av >>> SHIFT_A) & 0xff;
	const a2 = (bv >>> SHIFT_A) & 0xff;
	const r1 = (((av >>> SHIFT_R) & 0xff) * a1 + rb * (255 - a1)) / 255;
	const g1 = (((av >>> SHIFT_G) & 0xff) * a1 + gb * (255 - a1)) / 255;
	const b1 = (((av >>> SHIFT_B) & 0xff) * a1 + bb * (255 - a1)) / 255;
	const r2 = (((bv >>> SHIFT_R) & 0xff) * a2 + rb * (255 - a2)) / 255;
	const g2 = (((bv >>> SHIFT_G) & 0xff) * a2 + gb * (255 - a2)) / 255;
	const b2 = (((bv >>> SHIFT_B) & 0xff) * a2 + bb * (255 - a2)) / 255;
	const lr1 = linLut(r1);
	const lg1 = linLut(g1);
	const lb1 = linLut(b1);
	const lr2 = linLut(r2);
	const lg2 = linLut(g2);
	const lb2 = linLut(b2);
	const l1 = cbrtLut(
		0.4122214708 * lr1 + 0.5363325363 * lg1 + 0.0514459929 * lb1,
	);
	const m1 = cbrtLut(
		0.2119034982 * lr1 + 0.6806995451 * lg1 + 0.1073969566 * lb1,
	);
	const s1 = cbrtLut(
		0.0883024619 * lr1 + 0.2817188376 * lg1 + 0.6299787005 * lb1,
	);
	const l2 = cbrtLut(
		0.4122214708 * lr2 + 0.5363325363 * lg2 + 0.0514459929 * lb2,
	);
	const m2 = cbrtLut(
		0.2119034982 * lr2 + 0.6806995451 * lg2 + 0.1073969566 * lb2,
	);
	const s2 = cbrtLut(
		0.0883024619 * lr2 + 0.2817188376 * lg2 + 0.6299787005 * lb2,
	);
	return hyab(
		lightness(l1, m1, s1) - lightness(l2, m2, s2),
		l1 - l2,
		m1 - m2,
		s1 - s2,
		maxDelta,
	);
}

/**
 * OKLab verdict for two different pixel words: 0 within `maxDelta`, else -1
 * when img2 is darker and 1 when not. `limits` comes from {@link stepLimits}.
 */
export function oklabDelta(
	av: number,
	bv: number,
	index: number,
	maxDelta: number,
	limits: Int32Array,
): number {
	if ((((av & bv) >>> SHIFT_A) & 0xff) !== 0xff)
		return transparentDelta(av, bv, index, maxDelta);
	if (withinStepBound(av, bv, limits)) return 0;
	return opaqueDelta(av, bv, maxDelta);
}
