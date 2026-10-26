//! Band-parallel encode (`encode_parallel`, feature `parallel`) against the
//! single-stream libdeflate `encode` at levels 4 and 6, on a 4K photo and a
//! full-page screenshot. Prints each output size before timing it.
//!
//! Run: `cargo bench -p blazediff-png --features parallel --bench parallel_encode`.

use blazediff_png::{decode, encode, encode_parallel, EncodeOptions, Image};
use criterion::{black_box, criterion_group, criterion_main, Criterion};
use std::num::NonZeroUsize;
use std::path::Path;

const FIXTURES: [&str; 2] = ["4k/1a.png", "page/1a.png"];
const THREADS: [usize; 4] = [1, 2, 4, 8];

fn load(name: &str) -> Image {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../fixtures")
        .join(name);
    decode(&std::fs::read(path).expect("fixture present (git lfs pull)")).unwrap()
}

fn bench(c: &mut Criterion) {
    for name in FIXTURES {
        let image = load(name);
        for level in [4u8, 6] {
            let options = EncodeOptions {
                compression: level,
                ..Default::default()
            };
            let one = NonZeroUsize::MIN;
            eprintln!(
                "{name} L{level}: encode {} bytes, encode_parallel {} bytes",
                encode(&image, &options).unwrap().len(),
                encode_parallel(&image, &options, one).unwrap().len()
            );
            let mut group = c.benchmark_group(format!("{name}/L{level}"));
            group.sample_size(10);
            group.bench_function("encode", |b| {
                b.iter(|| black_box(encode(black_box(&image), &options).unwrap()))
            });
            for n in THREADS {
                let threads = NonZeroUsize::new(n).unwrap();
                group.bench_function(format!("encode_parallel/{n}"), |b| {
                    b.iter(|| {
                        black_box(encode_parallel(black_box(&image), &options, threads).unwrap())
                    })
                });
            }
            group.finish();
        }
    }
}

criterion_group!(benches, bench);
criterion_main!(benches);
