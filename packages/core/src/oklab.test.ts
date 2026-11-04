import { describe, expect, it } from "vitest";
import { STEP_BOUND, writeOklab } from "./oklab";

/** (l, m, s, Lr) for every (g, b) at one red value, via the runtime's own math. */
function plane(r: number): Float64Array {
	const out = new Float64Array(65536 * 4);
	for (let g = 0; g < 256; g++) {
		for (let b = 0; b < 256; b++) writeOklab(r, g, b, out, ((g << 8) | b) * 4);
	}
	return out;
}

function hyabDistance(
	p: Float64Array,
	o1: number,
	q: Float64Array,
	o2: number,
): number {
	const dl = p[o1] - q[o2];
	const dm = p[o1 + 1] - q[o2 + 1];
	const ds = p[o1 + 2] - q[o2 + 2];
	const da = 1.9779984951 * dl - 2.428592205 * dm + 0.4505937099 * ds;
	const db = 0.0259040371 * dl + 0.7827717662 * dm - 0.808675766 * ds;
	return Math.abs(p[o1 + 3] - q[o2 + 3]) + Math.sqrt(da * da + db * db);
}

describe("STEP_BOUND", () => {
	// The reject test is only exact if every one-step move between colors whose
	// channels are all >= v stays within STEP_BOUND[v]. Check all 2^24 colors.
	it("bounds every Chebyshev unit step over the full RGB cube", () => {
		const worst = new Float64Array(256);
		let current = plane(0);
		for (let r = 0; r < 256; r++) {
			const next = r < 255 ? plane(r + 1) : current;
			for (let g = 0; g < 256; g++) {
				for (let b = 0; b < 256; b++) {
					const o1 = ((g << 8) | b) * 4;
					const min1 = Math.min(r, g, b);
					for (let dr = 0; dr <= 1; dr++) {
						for (let dg = -1; dg <= 1; dg++) {
							for (let db = -1; db <= 1; db++) {
								// One direction per ± pair.
								if (dr === 0 && (dg < 0 || (dg === 0 && db <= 0))) continue;
								const r2 = r + dr;
								const g2 = g + dg;
								const b2 = b + db;
								if (r2 > 255 || g2 < 0 || g2 > 255 || b2 < 0 || b2 > 255)
									continue;
								const v = Math.min(min1, r2, g2, b2);
								const d = hyabDistance(
									current,
									o1,
									dr ? next : current,
									((g2 << 8) | b2) * 4,
								);
								if (d > worst[v]) worst[v] = d;
							}
						}
					}
				}
			}
			current = next;
		}

		let suffixMax = 0;
		for (let v = 255; v >= 0; v--) {
			suffixMax = Math.max(suffixMax, worst[v]);
			expect(STEP_BOUND[v]).toBeGreaterThan(suffixMax);
		}
	}, 120_000);

	it("is non-increasing in the minimum channel", () => {
		for (let v = 1; v < 256; v++) {
			expect(STEP_BOUND[v]).toBeLessThanOrEqual(STEP_BOUND[v - 1]);
		}
	});
});
