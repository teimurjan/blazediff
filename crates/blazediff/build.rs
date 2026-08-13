//! Build script for blazediff.
//!
//! The vendored C codecs moved to `blazediff-shared`, so all that is left here is
//! napi-rs's linker setup for the N-API build.

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();
}
