//! SIMD utilities (pixel comparison, YIQ delta).
//!
//! Note: diff.rs has its own inline SIMD for tighter hot loop integration.
//! This module provides standalone SIMD primitives for other use cases.

#[cfg(target_arch = "x86_64")]
pub mod x86;

#[cfg(target_arch = "aarch64")]
pub mod aarch64;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SimdBackend {
    Scalar,
    #[cfg(target_arch = "x86_64")]
    Sse41,
    #[cfg(target_arch = "x86_64")]
    Avx2,
    #[cfg(target_arch = "x86_64")]
    Avx512,
    #[cfg(target_arch = "aarch64")]
    Neon,
}

pub fn detect_backend() -> SimdBackend {
    #[cfg(target_arch = "x86_64")]
    {
        if is_x86_feature_detected!("avx512f") && is_x86_feature_detected!("avx512bw") {
            return SimdBackend::Avx512;
        }
        if is_x86_feature_detected!("avx2") {
            return SimdBackend::Avx2;
        }
        if is_x86_feature_detected!("sse4.1") {
            return SimdBackend::Sse41;
        }
    }

    #[cfg(target_arch = "aarch64")]
    {
        // NEON is always available on AArch64
        return SimdBackend::Neon;
    }

    #[allow(unreachable_code)]
    SimdBackend::Scalar
}

pub fn lane_count() -> usize {
    match detect_backend() {
        SimdBackend::Scalar => 4,
        #[cfg(target_arch = "x86_64")]
        SimdBackend::Sse41 => 4,
        #[cfg(target_arch = "x86_64")]
        SimdBackend::Avx2 => 8,
        #[cfg(target_arch = "x86_64")]
        SimdBackend::Avx512 => 16,
        #[cfg(target_arch = "aarch64")]
        SimdBackend::Neon => 4,
    }
}

#[inline]
pub fn compare_pixels(a: &[u32], b: &[u32]) -> bool {
    debug_assert_eq!(a.len(), b.len());

    #[cfg(target_arch = "x86_64")]
    {
        let backend = detect_backend();
        match backend {
            SimdBackend::Avx512 if a.len() >= 16 => {
                // Safety: We checked for AVX-512 support
                return unsafe { x86::compare_16_avx512(a.as_ptr(), b.as_ptr()) };
            }
            SimdBackend::Avx2 | SimdBackend::Avx512 if a.len() >= 8 => {
                // Safety: We checked for AVX2 support
                return unsafe { x86::compare_8_avx2(a.as_ptr(), b.as_ptr()) };
            }
            SimdBackend::Sse41 | SimdBackend::Avx2 | SimdBackend::Avx512 if a.len() >= 4 => {
                // Safety: We checked for SSE4.1 support
                return unsafe { x86::compare_4_sse41(a.as_ptr(), b.as_ptr()) };
            }
            _ => {}
        }
    }

    #[cfg(target_arch = "aarch64")]
    {
        let mut offset = 0;
        while offset + 4 <= a.len() {
            // Safety: NEON is always available on AArch64
            if unsafe { aarch64::compare_4_neon(a.as_ptr().add(offset), b.as_ptr().add(offset)) } {
                return true;
            }
            offset += 4;
        }
        // Handle remaining pixels with scalar
        while offset < a.len() {
            if a[offset] != b[offset] {
                return true;
            }
            offset += 1;
        }
        return false;
    }

    // Scalar fallback
    #[allow(unreachable_code)]
    compare_pixels_scalar(a, b)
}

#[inline]
fn compare_pixels_scalar(a: &[u32], b: &[u32]) -> bool {
    for i in 0..a.len() {
        if a[i] != b[i] {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_backend() {
        let backend = detect_backend();
        println!("Detected SIMD backend: {:?}", backend);
        // Should always return something valid
        #[cfg(target_arch = "x86_64")]
        assert!(matches!(
            backend,
            SimdBackend::Scalar | SimdBackend::Sse41 | SimdBackend::Avx2 | SimdBackend::Avx512
        ));
        #[cfg(target_arch = "aarch64")]
        assert!(matches!(backend, SimdBackend::Scalar | SimdBackend::Neon));
        #[cfg(not(any(target_arch = "x86_64", target_arch = "aarch64")))]
        assert!(matches!(backend, SimdBackend::Scalar));
    }

    #[test]
    fn test_lane_count() {
        let lanes = lane_count();
        assert!(lanes >= 4);
        assert!(lanes <= 16);
        assert!(lanes.is_power_of_two());
    }

    #[test]
    fn test_compare_identical() {
        let a = [0x12345678u32; 16];
        let b = [0x12345678u32; 16];
        assert!(!compare_pixels(&a, &b));
    }

    #[test]
    fn test_compare_different() {
        let a = [0x12345678u32; 16];
        let mut b = [0x12345678u32; 16];
        b[7] = 0xDEADBEEF;
        assert!(compare_pixels(&a, &b));
    }

    #[test]
    fn test_compare_first_different() {
        let a = [0x12345678u32; 16];
        let mut b = [0x12345678u32; 16];
        b[0] = 0xDEADBEEF;
        assert!(compare_pixels(&a, &b));
    }

    #[test]
    fn test_compare_last_different() {
        let a = [0x12345678u32; 16];
        let mut b = [0x12345678u32; 16];
        b[15] = 0xDEADBEEF;
        assert!(compare_pixels(&a, &b));
    }
}
