//! Build script for blazediff-milo.
//!
//! Only the N-API build needs one; the metric is pure Rust with nothing to
//! compile ahead of time.

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();
}
