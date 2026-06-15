//! Fast image diffing with two-pass block optimization and SIMD.
//!
//! - **Block-based**: Cold pass identifies changed blocks, hot pass processes only those
//! - **SIMD**: NEON (aarch64), SSE4.1 (x86_64), scalar fallback
//! - **YIQ perceptual delta**: More accurate than RGB euclidean distance
//! - **Anti-aliasing detection**: Optionally exclude AA pixels from diff count
//!
//! ```no_run
//! use blazediff::{diff, load_png, save_png, DiffOptions, Image};
//!
//! let img1 = load_png("a.png").unwrap();
//! let img2 = load_png("b.png").unwrap();
//! let mut output = Image::new(img1.width, img1.height);
//!
//! let result = diff(&img1, &img2, Some(&mut output), &DiffOptions::default()).unwrap();
//! save_png(&output, "diff.png").unwrap();
//! println!("{} pixels differ", result.diff_count);
//! ```

pub mod antialiasing;
pub mod diff;
#[cfg(feature = "interpret")]
pub mod interpret;
#[cfg(feature = "io")]
pub mod io;
#[cfg(feature = "io")]
pub mod jpeg_io;
#[cfg(feature = "napi")]
mod napi;
pub mod output;
#[cfg(feature = "python")]
mod python;
#[cfg(feature = "io")]
pub mod qoi_io;
pub mod simd;
#[cfg(feature = "io")]
#[allow(
    non_upper_case_globals,
    non_camel_case_types,
    non_snake_case,
    dead_code
)]
pub mod spng_ffi;
#[cfg(feature = "io")]
#[allow(
    non_upper_case_globals,
    non_camel_case_types,
    non_snake_case,
    dead_code
)]
mod turbojpeg_ffi;
pub mod types;
#[cfg(all(feature = "wasm", target_arch = "wasm32"))]
mod wasm;
pub mod yiq;

// Re-export main types and functions
pub use diff::diff;
#[cfg(feature = "io")]
pub use io::{encode_png, load_png, load_pngs, save_png, save_png_with_compression};
#[cfg(feature = "io")]
pub use jpeg_io::{load_jpeg, load_jpegs, save_jpeg};
#[cfg(feature = "io")]
pub use qoi_io::{load_qoi, load_qois, save_qoi};
pub use types::{DiffError, DiffOptions, DiffResult, Image};

/// Fuzzing-only oracle: exposes the pub(crate) spng reference decoder so the
/// `blazediff_png` differential tests can check their decode against it.
#[cfg(all(feature = "io", feature = "fuzzing"))]
#[doc(hidden)]
pub fn decode_spng_reference(data: &[u8]) -> Result<Image, DiffError> {
    io::decode_spng(data)
}

/// Fuzzing-only oracle: decode through spng at an arbitrary `SPNG_FMT_*` and
/// decode-flags combination, for `blazediff_png`'s format-parity tests.
/// Returns `(width, height, color_type, bit_depth, bytes)`.
#[cfg(all(feature = "io", feature = "fuzzing"))]
#[doc(hidden)]
pub fn decode_spng_reference_fmt(
    data: &[u8],
    fmt: std::os::raw::c_int,
    flags: std::os::raw::c_int,
) -> Result<(u32, u32, u8, u8, Vec<u8>), DiffError> {
    io::decode_spng_fmt(data, fmt, flags)
}
