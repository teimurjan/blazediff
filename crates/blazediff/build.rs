//! Build script for blazediff-rs
//! Compiles libspng with SIMD optimizations and libjpeg-turbo via cmake

use std::env;
use std::path::PathBuf;

fn main() {
    // Setup napi-build for N-API bindings (when napi feature is enabled)
    #[cfg(feature = "napi")]
    napi_build::setup();

    let libspng_dir = "vendor/libspng/spng";
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();

    // Build miniz on Windows (no system zlib)
    let miniz_include = if target_os == "windows" {
        Some(build_miniz())
    } else {
        println!("cargo:rustc-link-lib=z");
        None
    };

    // Build libspng
    build_libspng(libspng_dir, &target_os, miniz_include.as_ref());

    // Build libjpeg-turbo from vendored source
    build_libjpeg_turbo();
}

fn build_miniz() -> PathBuf {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("miniz");

    let dst = cmake::Config::new(&src_dir)
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .build();

    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    // NOTE: Don't link miniz here - it must be linked AFTER spng (which depends on it)
    // The link directive is in build_libspng() for correct ordering

    println!("cargo:rerun-if-changed=vendor/miniz/CMakeLists.txt");

    // Return include directory for spng (miniz installs to include/miniz/)
    dst.join("include").join("miniz")
}

fn build_libspng(libspng_dir: &str, target_os: &str, miniz_include: Option<&PathBuf>) {
    let mut build = cc::Build::new();
    build
        .file(format!("{}/spng.c", libspng_dir))
        .include(libspng_dir)
        .define("SPNG_STATIC", None)
        .opt_level(3);

    // Use miniz on Windows
    if target_os == "windows" {
        if let Some(include_dir) = miniz_include {
            build.include(include_dir);
        }
        build.define("SPNG_USE_MINIZ", None);
    }

    // MSVC vs GCC/Clang flags
    if env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default() == "msvc" {
        // MSVC doesn't support -std=c99
    } else {
        build.flag("-std=c99");
    }

    // libspng auto-detects SIMD (ARM NEON, x86 SSE) based on target architecture
    build.compile("spng");

    // Link miniz AFTER spng on Windows (spng depends on miniz, linker needs correct order)
    if target_os == "windows" {
        println!("cargo:rustc-link-lib=static=miniz");
    }

    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.c");
    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.h");
}

fn build_libjpeg_turbo() {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("libjpeg-turbo");

    // Use cmake crate to build libjpeg-turbo
    let dst = cmake::Config::new(&src_dir)
        .define("ENABLE_SHARED", "OFF")
        .define("ENABLE_STATIC", "ON")
        .define("WITH_TURBOJPEG", "ON")
        .define("WITH_JAVA", "OFF")
        .define("WITH_JPEG7", "OFF")
        .define("WITH_JPEG8", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .build();

    // Link the static library
    println!("cargo:rustc-link-search=native={}/lib", dst.display());

    // Library naming differs by platform:
    // - Unix: libturbojpeg.a, libjpeg.a
    // - Windows: turbojpeg-static.lib, jpeg-static.lib
    let lib_dir = dst.join("lib");

    // TurboJPEG library
    if lib_dir.join("libturbojpeg.a").exists() {
        println!("cargo:rustc-link-lib=static=turbojpeg");
    } else if lib_dir.join("turbojpeg-static.lib").exists() {
        println!("cargo:rustc-link-lib=static=turbojpeg-static");
    } else {
        // Fallback
        println!("cargo:rustc-link-lib=static=turbojpeg");
    }

    // JPEG library
    if lib_dir.join("libjpeg.a").exists() {
        println!("cargo:rustc-link-lib=static=jpeg");
    } else if lib_dir.join("jpeg-static.lib").exists() {
        println!("cargo:rustc-link-lib=static=jpeg-static");
    } else {
        // Fallback
        println!("cargo:rustc-link-lib=static=jpeg");
    }

    println!("cargo:rerun-if-changed=vendor/libjpeg-turbo/src/turbojpeg.c");
    println!("cargo:rerun-if-changed=vendor/libjpeg-turbo/CMakeLists.txt");
}
