//! Lane-generic f32 primitives behind the convolution kernels.
//!
//! The whole metric is three shapes: a fused multiply-add with one operand
//! broadcast (the convolution tap), a `max(x, 0)` (ReLU) and a horizontal sum
//! (the last layer's dot product and the score). Each kernel is written once
//! against [`SimdF32`]; the backend is picked at compile time by the [`Vf32`]
//! alias, so nothing dispatches inside a hot loop. Same design as
//! `blazediff-ssim`'s `simd` module, extended with `max` and a wider x86 lane.
//!
//! Every backend is baseline for its target (NEON on aarch64, SSE2 on x86_64,
//! simd128 on wasm32), except that x86_64 widens to AVX2 with fused
//! multiply-add when the build enables them (`-C target-cpu=haswell`, which is
//! what every shipped binary is built with). A baseline x86_64 build still
//! works; it just runs the four-lane, unfused path.

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
    /// `self + a * b`, fused where the ISA has an FMA unit.
    fn mul_add(self, a: Self, b: Self) -> Self;
    fn max(self, rhs: Self) -> Self;
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
        fn mul_add(self, a: Self, b: Self) -> Self {
            Neon(unsafe { vfmaq_f32(self.0, a.0, b.0) })
        }

        #[inline(always)]
        fn max(self, rhs: Self) -> Self {
            Neon(unsafe { vmaxq_f32(self.0, rhs.0) })
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            unsafe { vaddvq_f32(self.0) }
        }
    }

    pub(crate) type Vf32 = Neon;
}

#[cfg(all(
    target_arch = "x86_64",
    target_feature = "avx2",
    target_feature = "fma"
))]
mod backend {
    use super::SimdF32;
    use std::arch::x86_64::*;

    #[derive(Clone, Copy)]
    pub(crate) struct Avx(__m256);

    impl SimdF32 for Avx {
        const LANES: usize = 8;

        #[inline(always)]
        unsafe fn load(ptr: *const f32) -> Self {
            Avx(_mm256_loadu_ps(ptr))
        }

        #[inline(always)]
        unsafe fn store(self, ptr: *mut f32) {
            _mm256_storeu_ps(ptr, self.0)
        }

        #[inline(always)]
        fn splat(value: f32) -> Self {
            // SAFETY: this module only compiles when avx2 is a target feature.
            Avx(unsafe { _mm256_set1_ps(value) })
        }

        #[inline(always)]
        fn mul_add(self, a: Self, b: Self) -> Self {
            Avx(unsafe { _mm256_fmadd_ps(a.0, b.0, self.0) })
        }

        #[inline(always)]
        fn max(self, rhs: Self) -> Self {
            Avx(unsafe { _mm256_max_ps(self.0, rhs.0) })
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            unsafe {
                let low = _mm256_castps256_ps128(self.0);
                let high = _mm256_extractf128_ps(self.0, 1);
                let quad = _mm_add_ps(low, high);
                let pairs = _mm_add_ps(quad, _mm_movehl_ps(quad, quad));
                let odd = _mm_shuffle_ps(pairs, pairs, 0x55);
                _mm_cvtss_f32(_mm_add_ss(pairs, odd))
            }
        }
    }

    pub(crate) type Vf32 = Avx;
}

#[cfg(all(
    target_arch = "x86_64",
    not(all(target_feature = "avx2", target_feature = "fma"))
))]
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
        fn mul_add(self, a: Self, b: Self) -> Self {
            // Baseline SSE2 has no FMA unit.
            Sse(unsafe { _mm_add_ps(self.0, _mm_mul_ps(a.0, b.0)) })
        }

        #[inline(always)]
        fn max(self, rhs: Self) -> Self {
            Sse(unsafe { _mm_max_ps(self.0, rhs.0) })
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
        fn mul_add(self, a: Self, b: Self) -> Self {
            // simd128 has no FMA; matches the SSE2 path.
            Wasm(f32x4_add(self.0, f32x4_mul(a.0, b.0)))
        }

        #[inline(always)]
        fn max(self, rhs: Self) -> Self {
            // `f32x4_pmax` is the C-style `a > b ? a : b`, which is what ReLU
            // needs; `f32x4_max` propagates NaN and is slower.
            Wasm(f32x4_pmax(rhs.0, self.0))
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
        fn mul_add(self, a: Self, b: Self) -> Self {
            Scalar4(std::array::from_fn(|i| self.0[i] + a.0[i] * b.0[i]))
        }

        #[inline(always)]
        fn max(self, rhs: Self) -> Self {
            Scalar4(std::array::from_fn(|i| {
                if self.0[i] > rhs.0[i] {
                    self.0[i]
                } else {
                    rhs.0[i]
                }
            }))
        }

        #[inline(always)]
        fn reduce_sum(self) -> f32 {
            self.0[0] + self.0[1] + self.0[2] + self.0[3]
        }
    }

    pub(crate) type Vf32 = Scalar4;
}

pub(crate) use backend::Vf32;

pub(crate) const LANES: usize = <Vf32 as SimdF32>::LANES;
