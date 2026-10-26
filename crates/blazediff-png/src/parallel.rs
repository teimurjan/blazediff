//! Band-parallel zlib compression for [`crate::encode_parallel`].
//!
//! The raw (filtered) stream is cut into fixed [`BAND`]-byte ranges, each
//! compressed independently as raw deflate and primed with the previous 32 KiB
//! of input as a preset dictionary (the pigz scheme, so matches still reach
//! across band edges). Every band but the last ends on a sync flush, a
//! byte-aligned non-final block, so the bands concatenate into one valid zlib
//! stream. libdeflate can only end on a final block, hence zlib-rs here.
//!
//! The output depends only on the input and level: band boundaries are fixed
//! and results are placed by band index, so the thread count changes speed,
//! never bytes.

use std::num::NonZeroUsize;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::thread;

use zlib_rs::adler32::{adler32, adler32_combine};
use zlib_rs::{Deflate, DeflateFlush, Status};

/// Raw bytes per band.
const BAND: usize = 256 * 1024;
/// Deflate's maximum match distance; the dictionary each band is primed with.
const WINDOW: usize = 32 * 1024;

struct Band {
    deflate: Vec<u8>,
    adler: u32,
    len: usize,
}

/// Compress `raw` into a zlib stream with up to `threads` workers. `level` is
/// 1..=12 and is capped at zlib's 9.
pub(crate) fn compress_banded(raw: &[u8], level: u8, threads: NonZeroUsize) -> Vec<u8> {
    let level = i32::from(level.min(9));
    let count = raw.len().div_ceil(BAND).max(1);
    let next = AtomicUsize::new(0);
    let worker = || {
        let mut done = Vec::new();
        loop {
            let index = next.fetch_add(1, Ordering::Relaxed);
            if index >= count {
                return done;
            }
            done.push((index, compress_band(raw, index, count, level)));
        }
    };

    let mut bands = thread::scope(|scope| {
        let worker = &worker;
        // A failed spawn (e.g. wasm32 without threads) just leaves more bands
        // for the calling thread, which always works too.
        let helpers: Vec<_> = (1..threads.get().min(count))
            .filter_map(|_| thread::Builder::new().spawn_scoped(scope, worker).ok())
            .collect();
        let mut bands = worker();
        for helper in helpers {
            bands.extend(helper.join().expect("band worker panicked"));
        }
        bands
    });
    bands.sort_unstable_by_key(|(index, _)| *index);

    let deflate_len: usize = bands.iter().map(|(_, b)| b.deflate.len()).sum();
    let mut out = Vec::with_capacity(2 + deflate_len + 4);
    out.extend_from_slice(&zlib_header(level));
    let mut checksum = 1;
    for (_, band) in &bands {
        out.extend_from_slice(&band.deflate);
        checksum = adler32_combine(checksum, band.adler, band.len as u64);
    }
    out.extend_from_slice(&checksum.to_be_bytes());
    out
}

fn compress_band(raw: &[u8], index: usize, count: usize, level: i32) -> Band {
    let start = index * BAND;
    let input = &raw[start..(start + BAND).min(raw.len())];
    let mut deflate = Deflate::new(level, false, 15);
    if start > 0 {
        deflate
            .set_dictionary(&raw[start.saturating_sub(WINDOW)..start])
            .expect("a fresh raw deflate stream accepts a dictionary");
    }
    let last = index + 1 == count;
    let flush = if last {
        DeflateFlush::Finish
    } else {
        DeflateFlush::SyncFlush
    };

    let mut out = vec![0u8; zlib_rs::compress_bound(input.len())];
    loop {
        let read = deflate.total_in() as usize;
        let written = deflate.total_out() as usize;
        let status = deflate
            .compress(&input[read..], &mut out[written..], flush)
            .expect("deflate state is valid");
        let consumed = deflate.total_in() as usize == input.len();
        let room_left = (deflate.total_out() as usize) < out.len();
        // A flush is complete once all input is in and output space remains.
        if status == Status::StreamEnd || (!last && consumed && room_left) {
            break;
        }
        if !room_left {
            out.resize(out.len() * 2, 0);
        }
    }
    out.truncate(deflate.total_out() as usize);
    Band {
        deflate: out,
        adler: adler32(1, input),
        len: input.len(),
    }
}

/// CMF/FLG for a 32 KiB window, FLEVEL set the way zlib sets it.
fn zlib_header(level: i32) -> [u8; 2] {
    let cmf = 0x78u8;
    let flevel = match level {
        ..=1 => 0u8,
        2..=5 => 1,
        6 => 2,
        _ => 3,
    };
    let flg = flevel << 6;
    let check = (31 - ((u16::from(cmf) << 8 | u16::from(flg)) % 31)) % 31;
    [cmf, flg | check as u8]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn header_passes_fcheck_at_every_level() {
        for level in 1..=9 {
            let [cmf, flg] = zlib_header(level);
            assert_eq!(
                (u16::from(cmf) << 8 | u16::from(flg)) % 31,
                0,
                "level {level}"
            );
            assert_eq!(flg & 0x20, 0, "no preset dictionary flag");
        }
    }
}
