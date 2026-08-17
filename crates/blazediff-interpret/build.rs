//! Build script for blazediff-interpret.
//!
//! Only the N-API build needs one; the classifier is pure Rust.

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();
}
