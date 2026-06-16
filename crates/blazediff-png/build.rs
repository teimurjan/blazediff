//! Detects whether the zlib the `zlib-backend` links provides
//! `inflateValidate` (added in zlib 1.2.9, `ZLIB_VERNUM >= 0x1290`).
//!
//! spng guards its own call the same way (`#if ZLIB_VERNUM >= 0x1290`, see
//! vendor/libspng/spng/spng.c), so matching the threshold keeps
//! blazediff_png's adler32 handling byte-identical to spng's on every
//! platform — including old-zlib targets (e.g. some aarch64-linux sysroots)
//! where the symbol is absent. There, both fall back to validating adler32
//! and, crucially, linking a reference to the missing symbol no longer fails.

use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    println!("cargo:rustc-check-cfg=cfg(has_inflate_validate)");
    println!("cargo:rerun-if-changed=build.rs");

    // Only the zlib backend links system zlib and references inflateValidate.
    if env::var_os("CARGO_FEATURE_ZLIB_BACKEND").is_none() {
        return;
    }

    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let probe = out_dir.join("zlib_vernum_probe.c");
    fs::write(
        &probe,
        "#include <zlib.h>\n\
         #if !defined(ZLIB_VERNUM) || ZLIB_VERNUM < 0x1290\n\
         #error inflateValidate unavailable\n\
         #endif\n\
         void blazediff_zlib_vernum_probe(void) {}\n",
    )
    .expect("write zlib version probe");

    // Compile-only probe against the *target* zlib headers (cc reads TARGET
    // from the environment). The `#error` fires during preprocessing on old
    // zlib, so no link against libz is needed. Any failure (old zlib, or
    // headers not found) safely degrades to "validate adler32".
    // try_compile sets up the target's include/sysroot flags so `<zlib.h>` is
    // found exactly as the real build finds it. cargo_warnings(false) keeps
    // the deliberate `#error` off old-zlib builds' output (it's expected, not
    // a problem); cargo_metadata(false) avoids emitting link directives.
    let has = cc::Build::new()
        .file(&probe)
        .warnings(false)
        .cargo_warnings(false)
        .cargo_metadata(false)
        .try_compile("blazediff_zlib_vernum_probe")
        .is_ok();

    if has {
        println!("cargo:rustc-cfg=has_inflate_validate");
    }
}
