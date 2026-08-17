//! Build script for blazediff-shared
//! Compiles libspng with SIMD optimizations and libjpeg-turbo via cmake

use std::env;
use std::path::PathBuf;

fn main() {
    // Skip vendored C compilation when the `codecs` feature is off (e.g. wasm
    // builds). Only the PNG/JPEG decoders need C; `Image`, `ImageError` and
    // `ImageFormat` are pure Rust.
    if env::var("CARGO_FEATURE_CODECS").is_err() {
        return;
    }

    let libspng_dir = "vendor/libspng/spng";
    let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap();
    let target_env = env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    let host = env::var("HOST").unwrap_or_default();

    // The msvc link line carries the *static* CRT (libcmt.lib + libucrt.lib),
    // so the vendored C has to be compiled against it too. cc's default is
    // `-MD`, which emits `__declspec(dllimport)` references to malloc/realloc
    // that only `ucrt.lib` satisfies; while these objects lived in blazediff's
    // own rlib that mismatch happened to resolve, but from a dependency rlib
    // lld-link loads them lazily and the link dies on
    // `undefined symbol: __declspec(dllimport) realloc`. Forcing `/MT` here
    // matches what is actually on the line and keeps spng's allocations on the
    // same heap as the `libc::free` in png_io.rs.
    let static_crt = target_env == "msvc";

    // Use the vendored miniz instead of system zlib whenever zlib headers
    // are not reliably available:
    //   - Windows targets (no system zlib)
    //   - Cross-compiling to Linux from a non-Linux host (e.g. maturin --zig
    //     from macOS - zig ships glibc but not zlib headers)
    //   - Explicit override via BLAZEDIFF_FORCE_MINIZ=1
    let cross_to_linux = target_os == "linux" && !host.contains("linux");
    let force_miniz = env::var("BLAZEDIFF_FORCE_MINIZ").is_ok();
    let use_miniz = target_os == "windows" || cross_to_linux || force_miniz;

    let miniz_include = if use_miniz {
        Some(build_miniz(static_crt))
    } else {
        println!("cargo:rustc-link-lib=z");
        None
    };

    // Build libspng
    build_libspng(
        libspng_dir,
        &target_os,
        miniz_include.as_ref(),
        use_miniz,
        static_crt,
    );

    // Build libjpeg-turbo from vendored source
    build_libjpeg_turbo(static_crt);
}

fn build_miniz(static_crt: bool) -> PathBuf {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("miniz");

    let mut config = cmake::Config::new(&src_dir);
    config
        .define("BUILD_SHARED_LIBS", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON");
    if static_crt {
        config.define("CMAKE_MSVC_RUNTIME_LIBRARY", "MultiThreaded");
    }
    let dst = config.build();

    println!("cargo:rustc-link-search=native={}/lib", dst.display());
    // NOTE: Don't link miniz here - it must be linked AFTER spng (which depends on it)
    // The link directive is in build_libspng() for correct ordering

    println!("cargo:rerun-if-changed=vendor/miniz/CMakeLists.txt");

    // Return include directory for spng (miniz installs to include/miniz/)
    dst.join("include").join("miniz")
}

fn build_libspng(
    libspng_dir: &str,
    _target_os: &str,
    miniz_include: Option<&PathBuf>,
    use_miniz: bool,
    static_crt: bool,
) {
    let mut build = cc::Build::new();
    build
        .file(format!("{}/spng.c", libspng_dir))
        .include(libspng_dir)
        .define("SPNG_STATIC", None)
        .opt_level(3);

    if static_crt {
        build.static_crt(true);
    }

    if use_miniz {
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

    // Link miniz AFTER spng (spng depends on miniz, linker needs correct order)
    if use_miniz {
        println!("cargo:rustc-link-lib=static=miniz");
    }

    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.c");
    println!("cargo:rerun-if-changed=vendor/libspng/spng/spng.h");
}

fn build_libjpeg_turbo(static_crt: bool) {
    let src_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap())
        .join("vendor")
        .join("libjpeg-turbo");

    // Use cmake crate to build libjpeg-turbo
    let mut config = cmake::Config::new(&src_dir);
    config
        .define("ENABLE_SHARED", "OFF")
        .define("ENABLE_STATIC", "ON")
        .define("WITH_TURBOJPEG", "ON")
        .define("WITH_JAVA", "OFF")
        .define("WITH_JPEG7", "OFF")
        .define("WITH_JPEG8", "OFF")
        // Defaults to ON, and `cmake --build` builds every target, so we were
        // compiling libjpeg-turbo's regression suite into every release build.
        // Its Catch2 runner is also the only C++ in this tree — which made an
        // MSVC-STL/clang version mismatch fail the Windows cross-build on a
        // test binary we never run.
        .define("WITH_TESTS", "OFF")
        .define("CMAKE_POSITION_INDEPENDENT_CODE", "ON");
    if static_crt {
        config.define("CMAKE_MSVC_RUNTIME_LIBRARY", "MultiThreaded");
    }
    let dst = config.build();

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
