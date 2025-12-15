//! Build script for blazediff-rs
//! Compiles libspng with SIMD optimizations

use std::env;

fn main() {
    let libspng_dir = "libspng";
    let target_arch = env::var("CARGO_CFG_TARGET_ARCH").unwrap();
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();

    let mut build = cc::Build::new();
    build
        .file(format!("{}/spng.c", libspng_dir))
        .include(libspng_dir)
        .define("SPNG_STATIC", None)
        .opt_level(3);

    // Use miniz on Windows (no system zlib), system zlib elsewhere
    if target_os == "windows" {
        build.file(format!("{}/miniz.c", libspng_dir));
        build.define("SPNG_USE_MINIZ", None);
    } else {
        println!("cargo:rustc-link-lib=z");
    }

    // MSVC vs GCC/Clang flags
    if env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default() == "msvc" {
        // MSVC doesn't support -std=c99
    } else {
        build.flag("-std=c99");
    }

    // Platform-specific SIMD optimizations
    if target_arch == "aarch64" {
        build.define("SPNG_ARM", None);
    } else if target_arch == "x86_64" {
        build.define("SPNG_SSE", Some("3"));
    }

    build.compile("spng");

    println!("cargo:rerun-if-changed=libspng/spng.c");
    println!("cargo:rerun-if-changed=libspng/spng.h");
    println!("cargo:rerun-if-changed=libspng/miniz.c");
    println!("cargo:rerun-if-changed=libspng/miniz.h");
}
