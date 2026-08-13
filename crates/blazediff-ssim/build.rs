//! Build script for blazediff-ssim.
//!
//! Only the N-API build needs one; the metrics are pure Rust with nothing to
//! compile ahead of time.

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();
}
