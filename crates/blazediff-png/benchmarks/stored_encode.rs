//! The BlazeDiff diff-write hot path: stored RGBA8 encode (`ColorMode::Rgba8`,
//! `Filter::None`, level 0, non-interlaced). This is the case the direct stored
//! writer collapses from ~4 buffered passes (clone -> raw -> stored zlib ->
//! assemble) to a single streaming pass over borrowed rows.
//!
//! Three entry points on a ~4 MP (16 MiB) RGBA8 diff buffer:
//!   - `encode_vec`    — `blazediff_png::encode`, one analytic-sized allocation;
//!   - `encode_stream` — `encode_to` into a reused buffer, no per-call alloc;
//!   - `spng_level0`   — libspng's stored level-0 encode, the reference.
//!
//! Run: `cargo bench --bench stored_encode`.

use blazediff::spng_ffi::*;
use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use std::os::raw::c_int;

use blazediff_png::{ColorMode, EncodeOptions, Filter, Image, ImageRef};

fn opts() -> EncodeOptions {
    EncodeOptions {
        color: ColorMode::Rgba8,
        compression: 0,
        filter: Filter::None,
        interlace: false,
    }
}

/// A representative diff buffer: colorful, mostly-opaque RGBA with enough unique
/// colors that no palette path applies — the shape of a real screenshot diff.
fn diff_image(width: u32, height: u32) -> Image {
    let n = (width as usize) * (height as usize);
    let mut data = Vec::with_capacity(n * 4);
    for i in 0..n {
        let v = (i.wrapping_mul(2654435761)) as u32;
        let a = if i % 64 == 0 { 200 } else { 255 };
        data.extend_from_slice(&[v as u8, (v >> 8) as u8, (v >> 16) as u8, a]);
    }
    Image {
        data,
        width,
        height,
    }
}

/// libspng stored level-0 encode, mirroring io.rs's spng branch.
fn spng_encode_stored(img: &Image) -> Vec<u8> {
    unsafe {
        let ctx = spng_ctx_new(spng_ctx_flags_SPNG_CTX_ENCODER as c_int);
        let mut ihdr = spng_ihdr {
            width: img.width,
            height: img.height,
            bit_depth: 8,
            color_type: spng_color_type_SPNG_COLOR_TYPE_TRUECOLOR_ALPHA as u8,
            compression_method: 0,
            filter_method: spng_filter_SPNG_FILTER_NONE as u8,
            interlace_method: spng_interlace_method_SPNG_INTERLACE_NONE as u8,
        };
        spng_set_ihdr(ctx, &mut ihdr);
        spng_set_option(ctx, spng_option_SPNG_ENCODE_TO_BUFFER, 1);
        spng_set_option(
            ctx,
            spng_option_SPNG_FILTER_CHOICE,
            spng_filter_choice_SPNG_DISABLE_FILTERING as c_int,
        );
        spng_set_option(ctx, spng_option_SPNG_IMG_COMPRESSION_LEVEL, 0);
        spng_encode_image(
            ctx,
            img.data.as_ptr() as *const _,
            img.data.len(),
            spng_format_SPNG_FMT_PNG as c_int,
            spng_encode_flags_SPNG_ENCODE_FINALIZE as c_int,
        );
        let mut len = 0usize;
        let mut err = 0 as c_int;
        let buf = spng_get_png_buffer(ctx, &mut len, &mut err);
        let out = std::slice::from_raw_parts(buf as *const u8, len).to_vec();
        libc::free(buf as *mut _);
        spng_ctx_free(ctx);
        out
    }
}

fn bench(c: &mut Criterion) {
    // ~4 MP (a 4K-ish diff): 2048x2048 RGBA8 = 16 MiB.
    let img = diff_image(2048, 2048);
    let bytes = img.data.len() as u64;

    let mut group = c.benchmark_group("stored_rgba8_encode");
    group.throughput(Throughput::Bytes(bytes));

    group.bench_function("encode_vec", |b| {
        b.iter(|| black_box(blazediff_png::encode(black_box(&img), &opts()).unwrap()));
    });

    group.bench_function("encode_stream", |b| {
        let mut sink = Vec::new();
        b.iter(|| {
            sink.clear();
            blazediff_png::encode_to(ImageRef::from(&img), &opts(), &mut sink).unwrap();
            black_box(&sink);
        });
    });

    group.bench_function("spng_level0", |b| {
        b.iter(|| black_box(spng_encode_stored(black_box(&img))));
    });

    group.finish();
}

criterion_group!(benches, bench);
criterion_main!(benches);
