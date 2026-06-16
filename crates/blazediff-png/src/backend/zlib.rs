//! Inflate/compress with spng/zlib acceptance semantics — the default,
//! parity-by-identity backend.
//!
//! spng (zlib, `SPNG_CTX_IGNORE_ADLER32`, CRC_USE) stops inflating the
//! moment the last scanline byte is produced: the adler32 trailer is never
//! verified and need not even be present, a missing BFINAL flag is fine, and
//! trailing garbage after the needed output is never parsed — *except* that
//! zlib look-ahead-decodes up to one symbol past the final output byte and
//! rejects invalid codes it sees there (while tolerating e.g. a
//! too-far-back distance, whose check sits after the output-space gate).
//!
//! Differential fuzzing showed those boundary semantics can't be faithfully
//! emulated on top of another inflate implementation (miniz_oxide validates
//! ahead of the write gate; libdeflate insists on complete, adler-valid
//! streams; zlib-ng/zlib-rs fixed classic zlib's "distance too far back"
//! window bookkeeping and so reject streams classic zlib accepts). Worse,
//! classic zlib's verdict depends on the *output gating*: the same stream
//! can pass with per-scanline avail_out windows and fail with one big
//! buffer, because the too-far check compares against bytes written in the
//! current call plus the (lagging) window history. So the exact path links
//! the very zlib spng links (system libz) and replicates spng's exact gate
//! sequence: 1 byte for the initial filter probe, then one window per
//! scanline, the final one a byte short. Parity by identity. libdeflate
//! remains the whole-buffer fast path for well-formed streams.

use core::ffi::c_int;
use libz_sys as z;

use super::{IdatInflate, StreamInflateError};

// zlib >= 1.2.9 extension spng relies on (skip adler32 verification);
// libz-sys doesn't declare it. Resolved from the same libz we link.
extern "C" {
    fn inflateValidate(strm: *mut z::z_stream, check: c_int) -> c_int;
}

/// Strict-window reference inflate for the differential fuzz harness only:
/// zlib-rs follows zlib-ng's fixed window bookkeeping and deterministically
/// rejects the too-far-back-distance streams that classic zlib tolerates at
/// gate boundaries (after which classic zlib copies uninitialized window
/// memory, making decode output — and even accept/reject — nondeterministic
/// for spng and for us alike). The harness uses this to classify those
/// inputs as having no behavioral contract.
#[cfg(feature = "fuzzing")]
pub mod strict {
    use core::ffi::c_int;
    use libz_rs_sys as z;

    pub struct Inflater {
        strm: Box<core::mem::MaybeUninit<z::z_stream>>,
    }

    impl Inflater {
        pub(crate) fn new() -> Option<Self> {
            let mut strm = Box::new(core::mem::MaybeUninit::<z::z_stream>::zeroed());
            let ret = unsafe {
                z::inflateInit2_(
                    strm.as_mut_ptr(),
                    15,
                    z::zlibVersion(),
                    core::mem::size_of::<z::z_stream>() as c_int,
                )
            };
            if ret != z::Z_OK {
                return None;
            }
            unsafe { z::inflateValidate(strm.as_mut_ptr(), 0) };
            Some(Self { strm })
        }

        fn strm(&mut self) -> &mut z::z_stream {
            // SAFETY: new() only returns Some after inflateInit2_
            // initialized every field.
            unsafe { self.strm.assume_init_mut() }
        }
    }

    impl Drop for Inflater {
        fn drop(&mut self) {
            unsafe { z::inflateEnd(self.strm.as_mut_ptr()) };
        }
    }

    /// inflate_idat with the strict backend; identical control flow to the
    /// system-zlib version in the parent module.
    pub fn inflate_idat<'a, I, W>(mut chunks: I, windows: W, out: &mut [u8]) -> super::IdatInflate
    where
        I: Iterator<Item = Option<&'a [u8]>>,
        W: Iterator<Item = usize>,
    {
        use super::IdatInflate;
        let Some(mut inf) = Inflater::new() else {
            return IdatInflate::BadStream;
        };
        let strm = inf.strm();

        let total = out.len();
        let mut out_pos = 0usize;

        for window in windows {
            // SAFETY: next_out points at out[out_pos..out_pos + window].
            strm.next_out = unsafe { out.as_mut_ptr().add(out_pos) };
            strm.avail_out = window as u32;

            while strm.avail_out != 0 {
                let ret = unsafe { z::inflate(strm, z::Z_NO_FLUSH) };
                match ret {
                    z::Z_OK => continue,
                    z::Z_STREAM_END => {
                        let produced = window - strm.avail_out as usize;
                        return if out_pos + produced == total {
                            IdatInflate::Done
                        } else {
                            IdatInflate::TooShort
                        };
                    }
                    z::Z_BUF_ERROR => match chunks.next() {
                        Some(Some(payload)) => {
                            strm.next_in = payload.as_ptr();
                            strm.avail_in = payload.len() as u32;
                        }
                        _ => return IdatInflate::NeedsInput,
                    },
                    _ => return IdatInflate::BadStream,
                }
            }
            out_pos += window;
        }
        debug_assert_eq!(out_pos, total);
        IdatInflate::Done
    }
}

/// RAII zlib inflate stream configured like spng's: windowBits 15,
/// adler32 validation off (`inflateValidate(0)` — the IGNORE_ADLER32 +
/// CRC_USE combination blazediff runs spng with).
struct Inflater {
    // Boxed for two reasons: z_stream contains non-nullable function-pointer
    // fields (zalloc/zfree), so a by-value zeroed struct is invalid Rust —
    // and zlib stores the stream address inside its internal state and
    // rejects calls if the stream has moved ("repeated call with bad
    // state"). The MaybeUninit is only assumed initialized after
    // inflateInit2_ fills every field.
    strm: Box<core::mem::MaybeUninit<z::z_stream>>,
}

impl Inflater {
    fn new() -> Option<Self> {
        let mut strm = Box::new(core::mem::MaybeUninit::<z::z_stream>::zeroed());
        let ret = unsafe {
            z::inflateInit2_(
                strm.as_mut_ptr(),
                15,
                z::zlibVersion(),
                core::mem::size_of::<z::z_stream>() as c_int,
            )
        };
        if ret != z::Z_OK {
            return None;
        }
        unsafe { inflateValidate(strm.as_mut_ptr(), 0) };
        Some(Self { strm })
    }

    fn strm(&mut self) -> &mut z::z_stream {
        // SAFETY: new() only returns Some after inflateInit2_ initialized
        // every field.
        unsafe { self.strm.assume_init_mut() }
    }
}

impl Drop for Inflater {
    fn drop(&mut self) {
        unsafe { z::inflateEnd(self.strm.as_mut_ptr()) };
    }
}

/// Inflate `chunks` (the IDAT payload sequence) into `out`, gated by
/// spng's exact avail_out window sequence (`windows` must sum to
/// `out.len()`) — the read_scanline_bytes/read_idat_bytes loop. `chunks`
/// yields payload slices lazily: a `None` item means the next chunk could
/// not be supplied (not an IDAT / truncated), which only matters if zlib
/// still needs input.
pub fn inflate_idat<'a, I, W>(mut chunks: I, windows: W, out: &mut [u8]) -> IdatInflate
where
    I: Iterator<Item = Option<&'a [u8]>>,
    W: Iterator<Item = usize>,
{
    let Some(mut inf) = Inflater::new() else {
        return IdatInflate::BadStream;
    };
    let strm = inf.strm();

    let total = out.len();
    let mut out_pos = 0usize;

    for window in windows {
        // SAFETY: next_out points at out[out_pos..out_pos + window], which
        // stays valid and unaliased for the duration of the inflate calls.
        strm.next_out = unsafe { out.as_mut_ptr().add(out_pos) };
        strm.avail_out = window as u32;

        while strm.avail_out != 0 {
            let ret = unsafe { z::inflate(strm, z::Z_NO_FLUSH) };
            match ret {
                z::Z_OK => continue,
                z::Z_STREAM_END => {
                    let produced = window - strm.avail_out as usize;
                    return if out_pos + produced == total {
                        IdatInflate::Done
                    } else {
                        IdatInflate::TooShort
                    };
                }
                z::Z_BUF_ERROR => {
                    // spng read_idat_bytes: pull the next IDAT chunk.
                    match chunks.next() {
                        Some(Some(payload)) => {
                            strm.next_in = payload.as_ptr() as *mut _;
                            strm.avail_in = payload.len() as u32;
                        }
                        _ => return IdatInflate::NeedsInput,
                    }
                }
                _ => return IdatInflate::BadStream,
            }
        }
        out_pos += window;
    }
    debug_assert_eq!(out_pos, total);
    IdatInflate::Done
}

/// Fast path: whole-buffer libdeflate. Succeeds only for streams libdeflate
/// fully agrees on (complete stream, exact output size); the caller falls
/// back to [`inflate_idat`] otherwise.
pub fn inflate_exact(zlib: &[u8], out: &mut [u8]) -> Option<bool> {
    let mut d = libdeflater::Decompressor::new();
    match d.zlib_decompress(zlib, out) {
        Ok(n) if n == out.len() => Some(true),
        // Any disagreement (short output, bad data, insufficient space)
        // could still be a stream spng accepts; let the exact path decide.
        _ => None,
    }
}

/// Replicates spng__inflate_stream for embedded streams (zTXt/iTXt/iCCP):
/// inflate a complete zlib stream (header + deflate + 4 trailer bytes, adler
/// unchecked) from `input`, growing the buffer from 8 KB by doubling.
/// Growth past `max / 2` is the fatal limit error; everything else that
/// stops the stream is recoverable. Returns total bytes inflated (spng
/// additionally rejects empty streams as EZLIB; the caller checks).
pub fn inflate_stream(input: &[u8], max: u64) -> Result<Vec<u8>, StreamInflateError> {
    let Some(mut inf) = Inflater::new() else {
        return Err(StreamInflateError::Bad);
    };
    let strm = inf.strm();
    strm.next_in = input.as_ptr() as *mut _;
    strm.avail_in = input.len() as u32;

    let mut size: usize = 8 * 1024;
    let mut buf = vec![0u8; size];
    strm.next_out = buf.as_mut_ptr();
    strm.avail_out = size as u32;

    loop {
        let ret = unsafe { z::inflate(strm, z::Z_NO_FLUSH) };
        match ret {
            z::Z_STREAM_END => {
                buf.truncate(strm.total_out as usize);
                return Ok(buf);
            }
            z::Z_OK | z::Z_BUF_ERROR => {}
            _ => return Err(StreamInflateError::Bad),
        }
        if strm.avail_out == 0 {
            // spng's resize-or-limit ladder.
            if size as u64 > max / 2 {
                return Err(StreamInflateError::Limit);
            }
            buf.resize(size * 2, 0);
            // SAFETY: the buffer was reallocated; repoint at its upper half.
            strm.next_out = unsafe { buf.as_mut_ptr().add(size) };
            strm.avail_out = size as u32;
            size *= 2;
        } else if strm.avail_in == 0 {
            // Chunk exhausted with the stream incomplete: recoverable EZLIB.
            return Err(StreamInflateError::Bad);
        }
    }
}

/// Compress `raw` to a zlib stream at deflate level `1..=12` (libdeflate).
/// Level 0 (stored) stays in `encode.rs` — it's pure Rust and shared by
/// every backend.
pub fn compress(raw: &[u8], level: u8) -> Vec<u8> {
    let lvl = libdeflater::CompressionLvl::new(level as i32).expect("level validated");
    let mut c = libdeflater::Compressor::new(lvl);
    let bound = c.zlib_compress_bound(raw.len());
    // libdeflate only *writes* the output buffer (it never reads it), so skip
    // zero-initializing `bound` (~input-sized) bytes that are immediately
    // overwritten or truncated away.
    let mut out: Vec<u8> = Vec::with_capacity(bound);
    // SAFETY: u8 has no validity invariant; zlib_compress writes the first `n`
    // bytes and the rest is dropped by `truncate` without ever being read.
    #[allow(clippy::uninit_vec)]
    unsafe {
        out.set_len(bound)
    };
    let n = c
        .zlib_compress(raw, &mut out)
        .expect("buffer sized by bound");
    out.truncate(n);
    out
}
