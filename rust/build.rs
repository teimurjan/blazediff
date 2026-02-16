//! Build script for blazediff-rs
//! Compiles wuffs (PNG decode), libspng (PNG encode), libjpeg-turbo (JPEG), and zlib-ng

use std::env;
use std::path::PathBuf;

fn main() {
    #[cfg(feature = "napi")]
    napi_build::setup();

    // Build zlib-ng (optimized zlib replacement)
    let zlib_ng_include = build_zlib_ng();

    // Build libspng for PNG decode/encode (using zlib-ng)
    build_libspng(&zlib_ng_include);

    // Build libjpeg-turbo
    build_libjpeg_turbo();
}

fn build_zlib_ng() -> PathBuf {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("zlib-ng");

    let dst = cmake::Config::new(&src_dir)
        .define("ZLIB_COMPAT", "ON")
        .define("ZLIB_ENABLE_TESTS", "OFF")
        .define("ZLIBNG_ENABLE_TESTS", "OFF")
        .define("WITH_GTEST", "OFF")
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .define("WITH_NATIVE_INSTRUCTIONS", "ON")
        .define("WITH_NEW_STRATEGIES", "ON")
        .define("WITH_OPTIM", "ON")
        .build();

    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    println!("cargo:rustc-link-lib=static=z");
    println!("cargo:rerun-if-changed=vendor/zlib-ng/CMakeLists.txt");

    dst.join("include")
}

fn build_libspng(zlib_include: &PathBuf) {
    let libspng_dir = "vendor/libspng/spng";

    cc::Build::new()
        .file(format!("{}/spng.c", libspng_dir))
        .include(libspng_dir)
        .include(zlib_include)
        .define("SPNG_STATIC", None)
        .opt_level(3)
        .flag_if_supported("-std=c99")
        .compile("spng");

    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.c");
    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.h");
}

fn build_libjpeg_turbo() {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("libjpeg-turbo");

    let dst = cmake::Config::new(&src_dir)
        .define("ENABLE_SHARED", "OFF")
        .define("ENABLE_STATIC", "ON")
        .define("WITH_TURBOJPEG", "ON")
        .define("WITH_JAVA", "OFF")
        .define("WITH_JPEG7", "OFF")
        .define("WITH_JPEG8", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON")
        .build();

    println!("cargo:rustc-link-search=native={}/lib", dst.display());

    let lib_dir = dst.join("lib");

    if lib_dir.join("libturbojpeg.a").exists() {
        println!("cargo:rustc-link-lib=static=turbojpeg");
    } else if lib_dir.join("turbojpeg-static.lib").exists() {
        println!("cargo:rustc-link-lib=static=turbojpeg-static");
    } else {
        println!("cargo:rustc-link-lib=static=turbojpeg");
    }

    if lib_dir.join("libjpeg.a").exists() {
        println!("cargo:rustc-link-lib=static=jpeg");
    } else if lib_dir.join("jpeg-static.lib").exists() {
        println!("cargo:rustc-link-lib=static=jpeg-static");
    } else {
        println!("cargo:rustc-link-lib=static=jpeg");
    }

    println!("cargo:rerun-if-changed=vendor/libjpeg-turbo/src/turbojpeg.c");
    println!("cargo:rerun-if-changed=vendor/libjpeg-turbo/CMakeLists.txt");
}
