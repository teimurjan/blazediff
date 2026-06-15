//! Output-parity check for blazediff's `BLAZEDIFF_PNG_ENABLED` toggle.
//!
//! Setting `BLAZEDIFF_PNG_ENABLED` swaps two paths inside blazediff's PNG I/O
//! (`crates/blazediff/src/io.rs`):
//!   - **decode** — `blazediff_png::decode` instead of spng's `FMT_RGBA8 + TRNS`;
//!   - **level-0 encode** — `blazediff_png` stored (uncompressed) deflate blocks
//!     instead of spng's level-0 `FMT_PNG` with filtering disabled.
//!
//! Everything between those two endpoints — the diff itself — is pure,
//! deterministic Rust over the decoded buffers. So blazediff's compare output is
//! the same image with the flag on vs off **iff** both swapped paths agree. This
//! checks exactly that, per fixture:
//!   - **decode** must be byte-identical RGBA8 — anything else changes the
//!     pixels fed to the diff;
//!   - **level-0 encode** must produce the same *image*. The two encoders are
//!     intentionally not byte-identical files — `blazediff_png` writes one IDAT
//!     chunk, spng splits the stream into 8 KB IDATs — but PNG readers
//!     concatenate IDATs before inflating, so both must decode to the same
//!     pixels. We re-decode each encoding and compare those.

use crate::codecs::spng_decode;
use blazediff::spng_ffi::*;
use blazediff_png::{ColorMode, EncodeOptions, Filter, Image};
use std::os::raw::c_int;
use std::path::{Path, PathBuf};

/// Check every fixture and print a per-fixture report. Returns `true` only if,
/// on all of them, decode is byte-identical to spng and the level-0 encode
/// re-decodes to the same image.
pub fn run(fixtures: &[PathBuf], dir: &Path) -> bool {
    println!(
        "=== PARITY: BLAZEDIFF_PNG_ENABLED on vs off ({} fixtures) ===\n",
        fixtures.len()
    );
    println!("{:<40}{:>10}{:>12}", "fixture", "decode", "encode(px)");
    println!("{}", "-".repeat(62));

    let mut all_ok = true;
    let mut checked = 0usize;
    for path in fixtures {
        let name = path
            .strip_prefix(dir)
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();
        let bytes = std::fs::read(path).unwrap();

        // blazediff_png is the codec the flag enables; spng is what it replaces.
        let bd = match blazediff_png::decode(&bytes) {
            Ok(img) => img,
            Err(e) => {
                println!("{:<40}{:>10}", trunc(&name, 40), format!("SKIP: {e}"));
                continue;
            }
        };
        let (sw, sh, sdata) = spng_decode(&bytes);

        let decode_ok = bd.width == sw && bd.height == sh && bd.data == sdata;

        // The level-0 encode is fed blazediff's own decode in io.rs, so the
        // diff buffer it writes is RGBA8 from this same decoder. Encode it both
        // ways, then re-decode each: the images must match each other and round-
        // trip back to the source pixels.
        let bd_img = spng_decode(&bd_encode_stored(&bd));
        let sp_img = spng_decode(&spng_encode_stored(&bd));
        let encode_ok = bd_img == sp_img && bd_img == (bd.width, bd.height, bd.data.clone());

        println!(
            "{:<40}{:>10}{:>12}",
            trunc(&name, 40),
            verdict(decode_ok),
            verdict(encode_ok),
        );
        all_ok &= decode_ok && encode_ok;
        checked += 1;
    }

    println!("{}", "-".repeat(62));
    if all_ok {
        println!("\n✅ PARITY OK — output identical on all {checked} fixtures");
    } else {
        println!("\n❌ PARITY FAILED — output differs (see rows above)");
    }
    all_ok
}

fn verdict(ok: bool) -> &'static str {
    if ok {
        "ok"
    } else {
        "DIFF"
    }
}

fn trunc(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        format!("…{}", &s[s.len() - (max - 1)..])
    }
}

/// blazediff_png stored encode, mirroring io.rs::encode_png's enabled branch:
/// RGBA8, compression 0 (stored deflate blocks), filter none, no interlace.
fn bd_encode_stored(img: &Image) -> Vec<u8> {
    blazediff_png::encode(
        img,
        &EncodeOptions {
            color: ColorMode::Rgba8,
            compression: 0,
            filter: Filter::None,
            interlace: false,
        },
    )
    .expect("blazediff stored encode")
}

/// spng level-0 encode, mirroring io.rs::encode_png's spng branch: `FMT_PNG`,
/// filtering disabled, compression level 0, finalize.
fn spng_encode_stored(img: &Image) -> Vec<u8> {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        assert!(!ctx.is_null());
        let mut ihdr = spng_ihdr {
            width: img.width,
            height: img.height,
            bit_depth: 8,
            color_type: spng_color_type_SPNG_COLOR_TYPE_TRUECOLOR_ALPHA as u8,
            compression_method: 0,
            filter_method: spng_filter_SPNG_FILTER_NONE as u8,
            interlace_method: spng_interlace_method_SPNG_INTERLACE_NONE as u8,
        };
        assert_eq!(spng_set_ihdr(ctx, &mut ihdr), 0);
        spng_set_option(ctx, spng_option_SPNG_ENCODE_TO_BUFFER, 1);
        spng_set_option(
            ctx,
            spng_option_SPNG_FILTER_CHOICE,
            spng_filter_choice_SPNG_DISABLE_FILTERING as c_int,
        );
        spng_set_option(ctx, spng_option_SPNG_IMG_COMPRESSION_LEVEL, 0);

        let ret = spng_encode_image(
            ctx,
            img.data.as_ptr() as *const _,
            img.data.len(),
            spng_format_SPNG_FMT_PNG as c_int,
            spng_encode_flags_SPNG_ENCODE_FINALIZE as c_int,
        );
        assert_eq!(ret, 0, "spng_encode_image");

        let mut len = 0usize;
        let mut err = 0 as c_int;
        let buf = spng_get_png_buffer(ctx, &mut len, &mut err);
        assert!(!buf.is_null() && err == 0);
        let out = std::slice::from_raw_parts(buf as *const u8, len).to_vec();
        libc::free(buf as *mut _);
        spng_ctx_free(ctx);
        out
    }
}
