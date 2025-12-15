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
pub mod io;
pub mod output;
pub mod simd;
#[allow(non_upper_case_globals, non_camel_case_types, non_snake_case, dead_code)]
mod spng_ffi;
pub mod types;
pub mod yiq;

// Re-export main types and functions
pub use diff::diff;
pub use io::{load_png, load_two_pngs, save_png};
pub use types::{DiffError, DiffOptions, DiffResult, Image};
