//! OKLab HyAB color difference (pixelmatch 8 parity).
//!
//! Operation-for-operation port of `@blazediff/core`'s `oklab.ts`: sRGB →
//! linear → LMS → cube root, compared with HyAB (|ΔLr| + √(Δa² + Δb²)) on
//! Ottosson's toe-corrected lightness. Threshold 1 is black vs white.

use std::sync::OnceLock;

const CBRT_N: usize = 4096;
/// Interpolation is off by up to 50% right above zero, so the first samples use `cbrt`.
const CBRT_EXACT: usize = 8;

const TOE_K1: f64 = 0.206;
const TOE_K2: f64 = 0.03;
const TOE_K3: f64 = (1.0 + TOE_K1) / (1.0 + TOE_K2);

/// Upper bound on the HyAB distance of one Chebyshev step between opaque
/// colors whose channels are all >= v, as `(v, bound)` buckets rounded up.
/// HyAB is a metric, so a pair d steps apart with every channel >= v is within
/// d * bound. Shared with `oklab.ts`, whose test proves it over all 2^24 colors.
const STEP_BOUND_BUCKETS: [(usize, f64); 13] = [
    (0, 0.04467),
    (1, 0.02131),
    (2, 0.01534),
    (3, 0.01241),
    (4, 0.01076),
    (5, 0.009616),
    (6, 0.008663),
    (7, 0.008087),
    (8, 0.007591),
    (16, 0.007169),
    (32, 0.007152),
    (64, 0.006794),
    (128, 0.006148),
];

struct Tables {
    lin: [f64; 257],
    l: [[f64; 256]; 3],
    m: [[f64; 256]; 3],
    s: [[f64; 256]; 3],
    cbrt: Vec<f64>,
    step_bound: [f64; 256],
}

fn tables() -> &'static Tables {
    static TABLES: OnceLock<Tables> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut lin = [0.0; 257];
        for (i, value) in lin.iter_mut().take(256).enumerate() {
            let c = i as f64 / 255.0;
            *value = if c <= 0.04045 {
                c / 12.92
            } else {
                ((c + 0.055) / 1.055).powf(2.4)
            };
        }
        lin[256] = lin[255];

        let mut l = [[0.0; 256]; 3];
        let mut m = [[0.0; 256]; 3];
        let mut s = [[0.0; 256]; 3];
        for i in 0..256 {
            let v = lin[i];
            l[0][i] = 0.4122214708 * v;
            m[0][i] = 0.2119034982 * v;
            s[0][i] = 0.0883024619 * v;
            l[1][i] = 0.5363325363 * v;
            m[1][i] = 0.6806995451 * v;
            s[1][i] = 0.2817188376 * v;
            l[2][i] = 0.0514459929 * v;
            m[2][i] = 0.1073969566 * v;
            s[2][i] = 0.6299787005 * v;
        }

        let cbrt = (0..=CBRT_N + 1)
            .map(|i| (i as f64 / CBRT_N as f64).cbrt())
            .collect();

        let mut step_bound = [0.0; 256];
        for (start, bound) in STEP_BOUND_BUCKETS {
            step_bound[start..].fill(bound);
        }

        Tables {
            lin,
            l,
            m,
            s,
            cbrt,
            step_bound,
        }
    })
}

/// Per-call OKLab metric: tables plus the threshold-dependent reject limits.
pub(crate) struct Oklab {
    tables: &'static Tables,
    max_delta: f64,
    /// Squared largest per-channel step that is provably within `max_delta`, by min channel.
    limits: [i32; 256],
}

impl Oklab {
    pub(crate) fn new(max_delta: f64) -> Self {
        let tables = tables();
        let mut limits = [0i32; 256];
        for (v, limit) in limits.iter_mut().enumerate() {
            let steps = (max_delta / tables.step_bound[v]).floor().clamp(0.0, 255.0) as i32;
            *limit = steps * steps;
        }
        Self {
            tables,
            max_delta,
            limits,
        }
    }

    /// Verdict for two different pixels: 0 within threshold, -1 when the
    /// second is darker, 1 when not.
    #[inline]
    pub(crate) fn delta(&self, pa: u32, pb: u32, index: usize) -> i32 {
        if (pa & pb) >> 24 != 0xFF {
            return self.transparent_delta(pa, pb, index);
        }
        if self.within_step_bound(pa, pb) {
            return 0;
        }
        let [l1, m1, s1, lr1] = self.point(pa);
        let [l2, m2, s2, lr2] = self.point(pb);
        hyab(lr1 - lr2, l1 - l2, m1 - m2, s1 - s2, self.max_delta)
    }

    #[inline(always)]
    fn within_step_bound(&self, pa: u32, pb: u32) -> bool {
        let (r1, g1, b1) = rgb(pa);
        let (r2, g2, b2) = rgb(pb);
        let min = r1.min(g1).min(b1).min(r2).min(g2).min(b2);
        let limit = self.limits[min as usize];
        let (dr, dg, db) = (r1 - r2, g1 - g2, b1 - b2);
        // One sign test instead of three branches on noisy data.
        ((limit - dr * dr) | (limit - dg * dg) | (limit - db * db)) >= 0
    }

    /// Cube-rooted l, m, s and toe-corrected lightness of an opaque pixel.
    #[inline(always)]
    fn point(&self, pixel: u32) -> [f64; 4] {
        let t = self.tables;
        let (r, g, b) = rgb(pixel);
        let (r, g, b) = (r as usize, g as usize, b as usize);
        let l = self.cbrt(t.l[0][r] + t.l[1][g] + t.l[2][b]);
        let m = self.cbrt(t.m[0][r] + t.m[1][g] + t.m[2][b]);
        let s = self.cbrt(t.s[0][r] + t.s[1][g] + t.s[2][b]);
        [l, m, s, lightness(l, m, s)]
    }

    /// Both pixels blended over one of 8 dark/light backgrounds picked by a
    /// Fibonacci hash of the pixel index.
    #[cold]
    fn transparent_delta(&self, pa: u32, pb: u32, index: usize) -> i32 {
        let h = (index as u32).wrapping_mul(0x9e37_79b1);
        let rb = 48 + 159 * (h >> 31);
        let gb = 48 + 159 * ((h >> 30) & 1);
        let bb = 48 + 159 * ((h >> 29) & 1);
        let blend = |pixel: u32| {
            let a = pixel >> 24;
            let mix = |c: u32, bg: u32| (c * a + bg * (255 - a)) as f64 / 255.0;
            (
                mix(pixel & 0xFF, rb),
                mix((pixel >> 8) & 0xFF, gb),
                mix((pixel >> 16) & 0xFF, bb),
            )
        };
        let lms = |(r, g, b): (f64, f64, f64)| {
            let (lr, lg, lb) = (self.lin(r), self.lin(g), self.lin(b));
            let l = self.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
            let m = self.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
            let s = self.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
            (l, m, s)
        };
        let (l1, m1, s1) = lms(blend(pa));
        let (l2, m2, s2) = lms(blend(pb));
        hyab(
            lightness(l1, m1, s1) - lightness(l2, m2, s2),
            l1 - l2,
            m1 - m2,
            s1 - s2,
            self.max_delta,
        )
    }

    #[inline(always)]
    fn lin(&self, x: f64) -> f64 {
        let lin = &self.tables.lin;
        let i = x as usize;
        lin[i] + (lin[i + 1] - lin[i]) * (x - i as f64)
    }

    #[inline(always)]
    fn cbrt(&self, x: f64) -> f64 {
        let t = x * CBRT_N as f64;
        let i = t as usize;
        if i < CBRT_EXACT {
            return x.cbrt();
        }
        let cbrt = &self.tables.cbrt;
        cbrt[i] + (cbrt[i + 1] - cbrt[i]) * (t - i as f64)
    }
}

#[inline(always)]
fn rgb(pixel: u32) -> (i32, i32, i32) {
    (
        (pixel & 0xFF) as i32,
        ((pixel >> 8) & 0xFF) as i32,
        ((pixel >> 16) & 0xFF) as i32,
    )
}

#[inline(always)]
fn lightness(l: f64, m: f64, s: f64) -> f64 {
    let lum = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    let x = TOE_K3 * lum - TOE_K1;
    0.5 * (x + (x * x + 4.0 * TOE_K2 * TOE_K3 * lum).sqrt())
}

/// HyAB threshold test without the sqrt: within iff |ΔLr| <= max_delta and
/// Δa² + Δb² <= (max_delta − |ΔLr|)².
#[inline(always)]
fn hyab(d_lr: f64, dl: f64, dm: f64, ds: f64, max_delta: f64) -> i32 {
    let rest = max_delta - d_lr.abs();
    if rest >= 0.0 {
        let da = 1.9779984951 * dl - 2.428592205 * dm + 0.4505937099 * ds;
        let db = 0.0259040371 * dl + 0.7827717662 * dm - 0.808675766 * ds;
        if da * da + db * db <= rest * rest {
            return 0;
        }
    }
    if d_lr > 0.0 {
        -1
    } else {
        1
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::yiq::pack_pixel;

    fn distance(a: [f64; 4], b: [f64; 4]) -> f64 {
        let (dl, dm, ds) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
        let da = 1.9779984951 * dl - 2.428592205 * dm + 0.4505937099 * ds;
        let db = 0.0259040371 * dl + 0.7827717662 * dm - 0.808675766 * ds;
        (a[3] - b[3]).abs() + (da * da + db * db).sqrt()
    }

    /// The JS suite checks all 2^24 colors; this strided pass guards the Rust
    /// tables, whose libm `powf`/`cbrt` may differ from V8's by an ulp.
    #[test]
    fn step_bound_holds_on_a_strided_cube() {
        let metric = Oklab::new(0.1);
        let channels: Vec<i32> = (0..8).chain((8..256).step_by(5)).collect();
        for &r in &channels {
            for &g in &channels {
                for &b in &channels {
                    let base = pack_pixel(r as u8, g as u8, b as u8, 255);
                    let p1 = metric.point(base);
                    for (dr, dg, db) in [(1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 1), (1, -1, 1)] {
                        let (r2, g2, b2) = (r + dr, g + dg, b + db);
                        if !(0..256).contains(&r2)
                            || !(0..256).contains(&g2)
                            || !(0..256).contains(&b2)
                        {
                            continue;
                        }
                        let other = pack_pixel(r2 as u8, g2 as u8, b2 as u8, 255);
                        let v = r.min(g).min(b).min(r2).min(g2).min(b2) as usize;
                        assert!(
                            distance(p1, metric.point(other)) < metric.tables.step_bound[v],
                            "({r},{g},{b}) step ({dr},{dg},{db})"
                        );
                    }
                }
            }
        }
    }

    #[test]
    fn black_and_white_differ_at_any_threshold_below_one() {
        let black = pack_pixel(0, 0, 0, 255);
        let white = pack_pixel(255, 255, 255, 255);
        assert_eq!(Oklab::new(0.99).delta(black, white, 0), 1);
        assert_eq!(Oklab::new(0.99).delta(white, black, 0), -1);
        assert_eq!(Oklab::new(1.01).delta(black, white, 0), 0);
    }

    #[test]
    fn step_bound_never_rejects_a_pixel_the_full_metric_counts() {
        for threshold in [0.01, 0.05, 0.1, 0.2] {
            let metric = Oklab::new(threshold);
            for base in (0..=255u8).step_by(3) {
                for step in 1..=20u8 {
                    let a = pack_pixel(base, base / 2, 255 - base, 255);
                    let b = pack_pixel(base.saturating_add(step), base / 2, 255 - base, 255);
                    if a == b || !metric.within_step_bound(a, b) {
                        continue;
                    }
                    let [l1, m1, s1, lr1] = metric.point(a);
                    let [l2, m2, s2, lr2] = metric.point(b);
                    assert_eq!(hyab(lr1 - lr2, l1 - l2, m1 - m2, s1 - s2, threshold), 0);
                }
            }
        }
    }
}
