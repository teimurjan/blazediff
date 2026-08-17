//! Lane-generic f32 primitives behind the SSIM metrics.
//!
//! Every SSIM variant spends nearly all of its time in five shapes: a
//! separable-convolution tap (`acc += src * k`), that tap's first iteration
//! (`out = src * k`), the elementwise square/cross-product pass, the SSIM
//! combine (two divides per window) and a sum reduction. Each is written once
//! against [`SimdF32`]; the backend is picked at compile time by the [`Vf32`]
//! alias, so nothing dispatches inside a hot loop.
//!
//! Unlike blazediff's own pixel-diff SIMD, which hand-writes one function per
//! architecture, the kernels here are shared: five kernels times four ISAs is too much
//! duplication to keep honest. Every backend is baseline for its target — NEON
//! on aarch64, SSE2 on x86_64, simd128 on wasm32 — so no runtime feature
//! detection is needed. Widening x86_64 to AVX2 would require a
//! `#[target_feature]` wrapper around each kernel (otherwise LLVM splits the
//! 256-bit ops back into pairs of 128-bit ones); that is a separate,
//! benchmark-driven change.

/// A fixed-width vector of `f32` lanes.
pub(crate) trait SimdF32: Copy {
    const LANES: usize;

    /// # Safety
    /// `ptr` must be valid for reads of `LANES` consecutive `f32`s.
    unsafe fn load(ptr: *const f32) -> Self;

    /// # Safety
    /// `ptr` must be valid for writes of `LANES` consecutive `f32`s.
    unsafe fn store(self, ptr: *mut f32);

    fn splat(value: f32) -> Self;
    fn add(self, rhs: Self) -> Self;
    fn sub(self, rhs: Self) -> Self;
    fn mul(self, rhs: Self) -> Self;
    fn div(self, rhs: Self) -> Self;
    /// `self + a * b`, fused where the ISA has an FMA unit.
    fn mul_add(self, a: Self, b: Self) -> Self;
    fn reduce_sum(self) -> f32;
}

#[cfg(target_arch = "aarch64")]
mod backend {
    use super::SimdF32;
    use std::arch::aarch64::*;

    #[derive(Clone, Copy)]
    pub(crate) struct Neon(float32x4_t);

    impl SimdF32 for Neon {
        const LANES: usize = 4;

        #[inline(always)]
        unsafe fn load(ptr: *const f32) -> Self {
            Neon(vld1q_f32(ptr))
        }

        #[inline(always)]
        unsafe fn store(self, ptr: *mut f32) {
            vst1q_f32(ptr, self.0)
        }

        #[inline(always)]
        fn splat(value: f32) -> Self {
            // SAFETY: NEON is baseline on aarch64.
            Neon(unsafe { vdupq_n_f32(value) })
        }

        #[inline(always)]
        fn add(self, rhs: Self) -> Self {
            Neon(unsafe { vaddq_f32(self.0, rhs.0) })
        }

        #[inline(always)]
        fn sub(self, rhs: Self) -> Self {
            Neon(unsafe { vsubq_f32(self.0, rhs.0) })
        }

        #[inline(always)]
        fn mul(self, rhs: Self) -> Self {
            Neon(unsafe { vmulq_f32(self.0, rhs.0) })
        }

        #[inline(always)]
        fn div(self, rhs: Self) -> Self {
            Neon(unsafe { vdivq_f32(self.0, rhs.0) })
        }

        #[inline(always)]
        fn mul_add(self, a: Self, b: Self) -> Self {
            Neon(unsafe { vfmaq_f32(self.0, a.0, b.0) })
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            unsafe { vaddvq_f32(self.0) }
        }
    }

    pub(crate) type Vf32 = Neon;
}

#[cfg(target_arch = "x86_64")]
mod backend {
    use super::SimdF32;
    use std::arch::x86_64::*;

    #[derive(Clone, Copy)]
    pub(crate) struct Sse(__m128);

    impl SimdF32 for Sse {
        const LANES: usize = 4;

        #[inline(always)]
        unsafe fn load(ptr: *const f32) -> Self {
            Sse(_mm_loadu_ps(ptr))
        }

        #[inline(always)]
        unsafe fn store(self, ptr: *mut f32) {
            _mm_storeu_ps(ptr, self.0)
        }

        #[inline(always)]
        fn splat(value: f32) -> Self {
            // SAFETY: SSE2 is baseline on x86_64.
            Sse(unsafe { _mm_set1_ps(value) })
        }

        #[inline(always)]
        fn add(self, rhs: Self) -> Self {
            Sse(unsafe { _mm_add_ps(self.0, rhs.0) })
        }

        #[inline(always)]
        fn sub(self, rhs: Self) -> Self {
            Sse(unsafe { _mm_sub_ps(self.0, rhs.0) })
        }

        #[inline(always)]
        fn mul(self, rhs: Self) -> Self {
            Sse(unsafe { _mm_mul_ps(self.0, rhs.0) })
        }

        #[inline(always)]
        fn div(self, rhs: Self) -> Self {
            Sse(unsafe { _mm_div_ps(self.0, rhs.0) })
        }

        #[inline(always)]
        fn mul_add(self, a: Self, b: Self) -> Self {
            // Baseline SSE2 has no FMA unit; the separate rounding of the
            // product is what the JS reference does anyway.
            Sse(unsafe { _mm_add_ps(self.0, _mm_mul_ps(a.0, b.0)) })
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            unsafe {
                let hi = _mm_movehl_ps(self.0, self.0);
                let pairs = _mm_add_ps(self.0, hi);
                let odd = _mm_shuffle_ps(pairs, pairs, 0x55);
                _mm_cvtss_f32(_mm_add_ss(pairs, odd))
            }
        }
    }

    pub(crate) type Vf32 = Sse;
}

#[cfg(all(target_arch = "wasm32", target_feature = "simd128"))]
mod backend {
    use super::SimdF32;
    use std::arch::wasm32::*;

    #[derive(Clone, Copy)]
    pub(crate) struct Wasm(v128);

    impl SimdF32 for Wasm {
        const LANES: usize = 4;

        #[inline(always)]
        unsafe fn load(ptr: *const f32) -> Self {
            Wasm(v128_load(ptr as *const v128))
        }

        #[inline(always)]
        unsafe fn store(self, ptr: *mut f32) {
            v128_store(ptr as *mut v128, self.0)
        }

        #[inline(always)]
        fn splat(value: f32) -> Self {
            Wasm(f32x4_splat(value))
        }

        #[inline(always)]
        fn add(self, rhs: Self) -> Self {
            Wasm(f32x4_add(self.0, rhs.0))
        }

        #[inline(always)]
        fn sub(self, rhs: Self) -> Self {
            Wasm(f32x4_sub(self.0, rhs.0))
        }

        #[inline(always)]
        fn mul(self, rhs: Self) -> Self {
            Wasm(f32x4_mul(self.0, rhs.0))
        }

        #[inline(always)]
        fn div(self, rhs: Self) -> Self {
            Wasm(f32x4_div(self.0, rhs.0))
        }

        #[inline(always)]
        fn mul_add(self, a: Self, b: Self) -> Self {
            // simd128 has no FMA; matches the SSE2 path.
            Wasm(f32x4_add(self.0, f32x4_mul(a.0, b.0)))
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            f32x4_extract_lane::<0>(self.0)
                + f32x4_extract_lane::<1>(self.0)
                + f32x4_extract_lane::<2>(self.0)
                + f32x4_extract_lane::<3>(self.0)
        }
    }

    pub(crate) type Vf32 = Wasm;
}

#[cfg(not(any(
    target_arch = "aarch64",
    target_arch = "x86_64",
    all(target_arch = "wasm32", target_feature = "simd128")
)))]
mod backend {
    use super::SimdF32;

    /// Scalar fallback. Written as a 4-wide array so the shape of the kernels
    /// stays identical and LLVM still has a chance to auto-vectorize.
    #[derive(Clone, Copy)]
    pub(crate) struct Scalar4([f32; 4]);

    impl SimdF32 for Scalar4 {
        const LANES: usize = 4;

        #[inline(always)]
        unsafe fn load(ptr: *const f32) -> Self {
            Scalar4([*ptr, *ptr.add(1), *ptr.add(2), *ptr.add(3)])
        }

        #[inline(always)]
        unsafe fn store(self, ptr: *mut f32) {
            for (lane, value) in self.0.iter().enumerate() {
                *ptr.add(lane) = *value;
            }
        }

        #[inline(always)]
        fn splat(value: f32) -> Self {
            Scalar4([value; 4])
        }

        #[inline(always)]
        fn add(self, rhs: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] + rhs.0[i]))
        }

        #[inline(always)]
        fn sub(self, rhs: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] - rhs.0[i]))
        }

        #[inline(always)]
        fn mul(self, rhs: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] * rhs.0[i]))
        }

        #[inline(always)]
        fn div(self, rhs: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] / rhs.0[i]))
        }

        #[inline(always)]
        fn mul_add(self, a: Self, b: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] + a.0[i] * b.0[i]))
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            self.0[0] + self.0[1] + self.0[2] + self.0[3]
        }
    }

    pub(crate) type Vf32 = Scalar4;
}

pub(crate) use backend::Vf32;

const LANES: usize = <Vf32 as SimdF32>::LANES;

/// `out[i] = src[i] * scale` — the first tap of a convolution, which lets the
/// accumulator skip a zeroing pass.
#[inline]
pub(crate) fn scale_into(out: &mut [f32], src: &[f32], scale: f32) {
    debug_assert_eq!(out.len(), src.len());
    let len = out.len();
    let scale_v = Vf32::splat(scale);
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and both slices have `len` elements.
        unsafe {
            Vf32::load(src.as_ptr().add(i))
                .mul(scale_v)
                .store(out.as_mut_ptr().add(i));
        }
        i += LANES;
    }
    while i < len {
        out[i] = src[i] * scale;
        i += 1;
    }
}

/// `acc[i] += src[i] * scale` — one convolution tap.
#[inline]
pub(crate) fn scale_add(acc: &mut [f32], src: &[f32], scale: f32) {
    debug_assert_eq!(acc.len(), src.len());
    let len = acc.len();
    let scale_v = Vf32::splat(scale);
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and both slices have `len` elements.
        unsafe {
            Vf32::load(acc.as_ptr().add(i))
                .mul_add(Vf32::load(src.as_ptr().add(i)), scale_v)
                .store(acc.as_mut_ptr().add(i));
        }
        i += LANES;
    }
    while i < len {
        acc[i] += src[i] * scale;
        i += 1;
    }
}

/// `out[j] = Σ_t kernel[t]·src[j + t]` — a whole convolution pass in one walk.
///
/// The equivalent [`scale_into`] then [`scale_add`] chain re-reads and re-writes
/// the destination once per tap, so an eleven-tap window costs eleven loads and
/// eleven stores of an accumulator that only ever needed eleven fused
/// multiply-adds. Holding it in a register instead drops the traffic by two
/// thirds without touching the arithmetic: tap zero multiplies, the rest fuse,
/// in ascending order, and the scalar tail stays *unfused* exactly as
/// [`scale_add`]'s scalar arm was.
#[inline]
pub(crate) fn convolve_taps(src: &[f32], out: &mut [f32], kernel: &[f32]) {
    let len = out.len();
    debug_assert!(src.len() + 1 >= len + kernel.len());
    let first = kernel[0];
    let first_v = Vf32::splat(first);

    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and `src` holds `len + kernel.len() - 1`.
        unsafe {
            let mut accumulator = Vf32::load(src.as_ptr().add(i)).mul(first_v);
            for (tap, weight) in kernel.iter().enumerate().skip(1) {
                accumulator = accumulator
                    .mul_add(Vf32::load(src.as_ptr().add(i + tap)), Vf32::splat(*weight));
            }
            accumulator.store(out.as_mut_ptr().add(i));
        }
        i += LANES;
    }
    while i < len {
        let mut total = src[i] * first;
        for (tap, weight) in kernel.iter().enumerate().skip(1) {
            total += src[i + tap] * weight;
        }
        out[i] = total;
        i += 1;
    }
}

/// The vertical half of five separable convolutions and the SSIM combine that
/// consumes them, fused into one walk over a row.
///
/// `ring` holds every plane's horizontally filtered rows; `rows[tap]` is the
/// offset, within a plane, of the row that tap reads, and `plane_stride` is the
/// distance between planes. Fusing keeps the five accumulators in registers —
/// unfused they are five row-sized buffers written eleven times each and read
/// back once — while leaving each output the same sequence of operations
/// [`scale_into`], [`scale_add`] and [`ssim_combine_split`] performed.
#[inline]
#[allow(clippy::too_many_arguments)]
pub(crate) fn vertical_taps_combine(
    ring: &[f32],
    plane_stride: usize,
    rows: &[usize],
    kernel: &[f32],
    c1: f32,
    c2: f32,
    map: &mut [f32],
    cs_map: &mut [f32],
) {
    const PLANES: usize = 5;
    let width = map.len();
    let first_v = Vf32::splat(kernel[0]);
    let c1_v = Vf32::splat(c1);
    let c2_v = Vf32::splat(c2);
    let two = Vf32::splat(2.0);

    let mut i = 0;
    while i + LANES <= width {
        // SAFETY: every `rows[tap] + i + LANES` stays inside its plane, which
        // `scale_statistics_into` sizes, and the maps are `width` long.
        unsafe {
            let mut accumulator = [first_v; PLANES];
            for (plane, slot) in accumulator.iter_mut().enumerate() {
                *slot =
                    Vf32::load(ring.as_ptr().add(plane * plane_stride + rows[0] + i)).mul(*slot);
            }
            for (tap, weight) in kernel.iter().enumerate().skip(1) {
                let weight_v = Vf32::splat(*weight);
                let row = rows[tap] + i;
                for (plane, slot) in accumulator.iter_mut().enumerate() {
                    *slot = slot.mul_add(
                        Vf32::load(ring.as_ptr().add(plane * plane_stride + row)),
                        weight_v,
                    );
                }
            }

            let [m1, m2, sigma1_sq, sigma2_sq, sigma12] = accumulator;
            let m1_sq = m1.mul(m1);
            let m2_sq = m2.mul(m2);
            let m1m2 = m1.mul(m2);
            let var1 = sigma1_sq.sub(m1_sq);
            let var2 = sigma2_sq.sub(m2_sq);
            let cov = sigma12.sub(m1m2);

            let luminance = m1m2.mul(two).add(c1_v).div(m1_sq.add(m2_sq).add(c1_v));
            let contrast = cov.mul(two).add(c2_v).div(var1.add(var2).add(c2_v));
            luminance.mul(contrast).store(map.as_mut_ptr().add(i));
            contrast.store(cs_map.as_mut_ptr().add(i));
        }
        i += LANES;
    }

    while i < width {
        let mut accumulator = [0f32; PLANES];
        for (plane, slot) in accumulator.iter_mut().enumerate() {
            *slot = ring[plane * plane_stride + rows[0] + i] * kernel[0];
        }
        for (tap, weight) in kernel.iter().enumerate().skip(1) {
            let row = rows[tap] + i;
            for (plane, slot) in accumulator.iter_mut().enumerate() {
                *slot += ring[plane * plane_stride + row] * weight;
            }
        }

        let [m1, m2, sigma1_sq, sigma2_sq, sigma12] = accumulator;
        let (m1_sq, m2_sq, m1m2) = (m1 * m1, m2 * m2, m1 * m2);
        let var1 = sigma1_sq - m1_sq;
        let var2 = sigma2_sq - m2_sq;
        let cov = sigma12 - m1m2;
        let luminance = (2.0 * m1m2 + c1) / (m1_sq + m2_sq + c1);
        let contrast = (2.0 * cov + c2) / (var1 + var2 + c2);
        map[i] = luminance * contrast;
        cs_map[i] = contrast;
        i += 1;
    }
}

/// Fill the three product images the SSIM statistics need in a single pass:
/// `a_sq = a²`, `b_sq = b²`, `ab = a·b`.
#[inline]
pub(crate) fn square_and_cross(
    a: &[f32],
    b: &[f32],
    a_sq: &mut [f32],
    b_sq: &mut [f32],
    ab: &mut [f32],
) {
    let len = a.len();
    debug_assert!(b.len() == len && a_sq.len() == len && b_sq.len() == len && ab.len() == len);
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and every slice has `len` elements.
        unsafe {
            let av = Vf32::load(a.as_ptr().add(i));
            let bv = Vf32::load(b.as_ptr().add(i));
            av.mul(av).store(a_sq.as_mut_ptr().add(i));
            bv.mul(bv).store(b_sq.as_mut_ptr().add(i));
            av.mul(bv).store(ab.as_mut_ptr().add(i));
        }
        i += LANES;
    }
    while i < len {
        let (av, bv) = (a[i], b[i]);
        a_sq[i] = av * av;
        b_sq[i] = bv * bv;
        ab[i] = av * bv;
        i += 1;
    }
}

/// Write the SSIM map as one fused quotient and return its sum.
///
/// `((2·µ1µ2 + c1)·(2·σ12 + c2)) / ((µ1² + µ2² + c1)·(σ1² + σ2² + c2))`, where
/// the `sigma*` inputs are still the raw filtered second moments — the mean
/// terms are subtracted here.
// Five moment planes, two stability constants and an output is what the formula
// takes; bundling them into a struct would only move the argument list.
#[allow(clippy::too_many_arguments)]
#[inline]
pub(crate) fn ssim_combine(
    mu1: &[f32],
    mu2: &[f32],
    sigma1_sq: &[f32],
    sigma2_sq: &[f32],
    sigma12: &[f32],
    c1: f32,
    c2: f32,
    map: &mut [f32],
) -> f64 {
    let len = map.len();
    let c1_v = Vf32::splat(c1);
    let c2_v = Vf32::splat(c2);
    let two = Vf32::splat(2.0);
    let mut total = 0f64;
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and every slice has `len` elements.
        unsafe {
            let m1 = Vf32::load(mu1.as_ptr().add(i));
            let m2 = Vf32::load(mu2.as_ptr().add(i));
            let m1_sq = m1.mul(m1);
            let m2_sq = m2.mul(m2);
            let m1m2 = m1.mul(m2);

            let var1 = Vf32::load(sigma1_sq.as_ptr().add(i)).sub(m1_sq);
            let var2 = Vf32::load(sigma2_sq.as_ptr().add(i)).sub(m2_sq);
            let cov = Vf32::load(sigma12.as_ptr().add(i)).sub(m1m2);

            let numerator = m1m2.mul(two).add(c1_v).mul(cov.mul(two).add(c2_v));
            let denominator = m1_sq.add(m2_sq).add(c1_v).mul(var1.add(var2).add(c2_v));
            let value = numerator.div(denominator);
            value.store(map.as_mut_ptr().add(i));
            total += value.reduce_sum() as f64;
        }
        i += LANES;
    }
    while i < len {
        let (m1, m2) = (mu1[i], mu2[i]);
        let (m1_sq, m2_sq, m1m2) = (m1 * m1, m2 * m2, m1 * m2);
        let var1 = sigma1_sq[i] - m1_sq;
        let var2 = sigma2_sq[i] - m2_sq;
        let cov = sigma12[i] - m1m2;
        let value =
            ((2.0 * m1m2 + c1) * (2.0 * cov + c2)) / ((m1_sq + m2_sq + c1) * (var1 + var2 + c2));
        map[i] = value;
        total += value as f64;
        i += 1;
    }
    total
}

/// Same statistics as [`ssim_combine`], but split into the luminance and
/// contrast-structure factors MS-SSIM pools separately: `ssim = l · cs`.
///
/// Writes both maps, so a caller can pool them by something other than the
/// mean; [`sum`] gives the totals in the same lane grouping this loop walks.
/// Kept apart from [`ssim_combine`] because two divides then a multiply do not
/// round to the same float as one fused quotient, and each variant has to match
/// its MATLAB reference.
///
/// Production reads these statistics through [`vertical_taps_combine`], which
/// fuses this arithmetic into the pass that produces its inputs. This unfused
/// form stays as the oracle that pins the fused one.
#[cfg(test)]
#[allow(clippy::too_many_arguments)]
pub(crate) fn ssim_combine_split(
    mu1: &[f32],
    mu2: &[f32],
    sigma1_sq: &[f32],
    sigma2_sq: &[f32],
    sigma12: &[f32],
    c1: f32,
    c2: f32,
    map: &mut [f32],
    cs_map: &mut [f32],
) {
    let len = map.len();
    let c1_v = Vf32::splat(c1);
    let c2_v = Vf32::splat(c2);
    let two = Vf32::splat(2.0);
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len` and every slice has `len` elements.
        unsafe {
            let m1 = Vf32::load(mu1.as_ptr().add(i));
            let m2 = Vf32::load(mu2.as_ptr().add(i));
            let m1_sq = m1.mul(m1);
            let m2_sq = m2.mul(m2);
            let m1m2 = m1.mul(m2);

            let var1 = Vf32::load(sigma1_sq.as_ptr().add(i)).sub(m1_sq);
            let var2 = Vf32::load(sigma2_sq.as_ptr().add(i)).sub(m2_sq);
            let cov = Vf32::load(sigma12.as_ptr().add(i)).sub(m1m2);

            let luminance = m1m2.mul(two).add(c1_v).div(m1_sq.add(m2_sq).add(c1_v));
            let contrast = cov.mul(two).add(c2_v).div(var1.add(var2).add(c2_v));
            let value = luminance.mul(contrast);
            value.store(map.as_mut_ptr().add(i));
            contrast.store(cs_map.as_mut_ptr().add(i));
        }
        i += LANES;
    }
    while i < len {
        let (m1, m2) = (mu1[i], mu2[i]);
        let (m1_sq, m2_sq, m1m2) = (m1 * m1, m2 * m2, m1 * m2);
        let var1 = sigma1_sq[i] - m1_sq;
        let var2 = sigma2_sq[i] - m2_sq;
        let cov = sigma12[i] - m1m2;
        let luminance = (2.0 * m1m2 + c1) / (m1_sq + m2_sq + c1);
        let contrast = (2.0 * cov + c2) / (var1 + var2 + c2);
        let value = luminance * contrast;
        map[i] = value;
        cs_map[i] = contrast;
        i += 1;
    }
}

/// Sum into an `f64` accumulator. Pooling a multi-megapixel map in `f32` would
/// lose more precision than the whole MATLAB tolerance budget.
#[inline]
pub(crate) fn sum(values: &[f32]) -> f64 {
    let len = values.len();
    let mut total = 0f64;
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len`.
        unsafe {
            total += Vf32::load(values.as_ptr().add(i)).reduce_sum() as f64;
        }
        i += LANES;
    }
    while i < len {
        total += values[i] as f64;
        i += 1;
    }
    total
}

/// `Σ |values[i] - mean|`, the second pass of mean-absolute-deviation pooling.
///
/// Four independent `f64` accumulators rather than one: a single running total
/// serialises the loop on the latency of an `f64` add, which is several times
/// the cost of the load and subtract feeding it. Four partials also sum
/// *closer* to the exact total than strict left-to-right order does, so the
/// reassociation is not a precision trade.
///
/// The mean stays `f64` — an `f32` mean would put an error of about `6e-8` into
/// every deviation, which is large enough to show up in a pooled score printed
/// to six places.
#[inline]
pub(crate) fn sum_absolute_deviation(values: &[f32], mean: f64) -> f64 {
    let mut totals = [0f64; 4];
    let mut chunks = values.chunks_exact(totals.len());
    for chunk in &mut chunks {
        for (total, value) in totals.iter_mut().zip(chunk) {
            *total += (*value as f64 - mean).abs();
        }
    }

    let mut total = (totals[0] + totals[1]) + (totals[2] + totals[3]);
    for value in chunks.remainder() {
        total += (*value as f64 - mean).abs();
    }
    total
}

/// `Σ (values[i] - mean)²`, the second pass of coefficient-of-variation pooling.
#[inline]
pub(crate) fn sum_squared_deviation(values: &[f32], mean: f32) -> f64 {
    let len = values.len();
    let mean_v = Vf32::splat(mean);
    let mut total = 0f64;
    let mut i = 0;
    while i + LANES <= len {
        // SAFETY: `i + LANES <= len`.
        unsafe {
            let deviation = Vf32::load(values.as_ptr().add(i)).sub(mean_v);
            total += deviation.mul(deviation).reduce_sum() as f64;
        }
        i += LANES;
    }
    while i < len {
        let deviation = values[i] - mean;
        total += (deviation * deviation) as f64;
        i += 1;
    }
    total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scale_into_matches_scalar() {
        let src: Vec<f32> = (0..37).map(|i| i as f32 * 0.5).collect();
        let mut out = vec![0f32; src.len()];
        scale_into(&mut out, &src, 0.25);
        for (i, value) in out.iter().enumerate() {
            assert_eq!(*value, src[i] * 0.25);
        }
    }

    #[test]
    fn scale_add_accumulates_every_tail_element() {
        let src: Vec<f32> = (0..37).map(|i| i as f32).collect();
        let mut acc = vec![1f32; src.len()];
        scale_add(&mut acc, &src, 2.0);
        for (i, value) in acc.iter().enumerate() {
            assert_eq!(*value, 1.0 + src[i] * 2.0);
        }
    }

    /// `convolve_taps` replaced this chain in every horizontal pass, so the
    /// metrics' agreement with MATLAB rides on the two being the same floats —
    /// including the tail, where the chain's scalar arm does *not* fuse.
    #[test]
    fn convolve_taps_matches_the_scale_into_scale_add_chain() {
        for len in [1usize, 3, 4, 7, 16, 37, 64] {
            for taps in [2usize, 5, 11] {
                let src: Vec<f32> = (0..len + taps - 1)
                    .map(|i| ((i * 37) % 251) as f32 * 0.37 + 1.0)
                    .collect();
                let kernel: Vec<f32> = (0..taps)
                    .map(|i| (i + 1) as f32 / (taps * (taps + 1) / 2) as f32)
                    .collect();

                let mut expected = vec![0f32; len];
                scale_into(&mut expected, &src[..len], kernel[0]);
                for (tap, weight) in kernel.iter().enumerate().skip(1) {
                    scale_add(&mut expected, &src[tap..tap + len], *weight);
                }

                let mut actual = vec![0f32; len];
                convolve_taps(&src, &mut actual, &kernel);
                assert_eq!(actual, expected, "len {len}, {taps} taps");
            }
        }
    }

    #[test]
    fn square_and_cross_covers_tail() {
        let a: Vec<f32> = (0..37).map(|i| i as f32).collect();
        let b: Vec<f32> = (0..37).map(|i| (i * 2) as f32).collect();
        let mut a_sq = vec![0f32; a.len()];
        let mut b_sq = vec![0f32; a.len()];
        let mut ab = vec![0f32; a.len()];
        square_and_cross(&a, &b, &mut a_sq, &mut b_sq, &mut ab);
        for i in 0..a.len() {
            assert_eq!(a_sq[i], a[i] * a[i]);
            assert_eq!(b_sq[i], b[i] * b[i]);
            assert_eq!(ab[i], a[i] * b[i]);
        }
    }

    #[test]
    fn identical_inputs_give_a_flat_unit_map() {
        let mu: Vec<f32> = (0..37).map(|i| 10.0 + i as f32).collect();
        let sigma: Vec<f32> = mu.iter().map(|m| m * m + 5.0).collect();
        let mut map = vec![0f32; mu.len()];
        let total = ssim_combine(&mu, &mu, &sigma, &sigma, &sigma, 6.5025, 58.5225, &mut map);
        assert!(map.iter().all(|value| *value == 1.0));
        assert!((total - mu.len() as f64).abs() < 1e-9);
    }

    #[test]
    fn split_combine_agrees_with_fused_combine() {
        let mu1: Vec<f32> = (0..37).map(|i| 10.0 + i as f32).collect();
        let mu2: Vec<f32> = (0..37).map(|i| 12.0 + i as f32 * 0.9).collect();
        let s1: Vec<f32> = mu1.iter().map(|m| m * m + 40.0).collect();
        let s2: Vec<f32> = mu2.iter().map(|m| m * m + 30.0).collect();
        let s12: Vec<f32> = mu1.iter().zip(&mu2).map(|(a, b)| a * b + 25.0).collect();

        let mut fused = vec![0f32; mu1.len()];
        let mut split = vec![0f32; mu1.len()];
        let mut cs = vec![0f32; mu1.len()];
        ssim_combine(&mu1, &mu2, &s1, &s2, &s12, 6.5025, 58.5225, &mut fused);
        ssim_combine_split(
            &mu1, &mu2, &s1, &s2, &s12, 6.5025, 58.5225, &mut split, &mut cs,
        );

        for i in 0..fused.len() {
            assert!((fused[i] - split[i]).abs() < 1e-5, "index {i}");
        }
    }

    #[test]
    fn sum_and_deviation_cover_the_tail() {
        let values: Vec<f32> = (0..37).map(|i| i as f32).collect();
        let expected: f64 = values.iter().map(|v| *v as f64).sum();
        assert!((sum(&values) - expected).abs() < 1e-9);

        let mean = (expected / values.len() as f64) as f32;
        let expected_deviation: f64 = values
            .iter()
            .map(|v| ((v - mean) * (v - mean)) as f64)
            .sum();
        assert!((sum_squared_deviation(&values, mean) - expected_deviation).abs() < 1e-3);
    }
}
