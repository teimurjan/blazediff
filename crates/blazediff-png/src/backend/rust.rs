//! Pure-Rust deflate backend — wasm-ready and C-free.
//!
//! Inflate (decode) runs on `zune-inflate`; compress (encode) runs on
//! `fdeflate`'s ultra-fast PNG-tuned deflate (see [`compress`]).
//!
//! **Parity caveat.** The default [`super::zlib`] backend gets byte-exact spng
//! accept/reject parity on *malformed* deflate streams by linking the very
//! zlib spng links and replaying spng's per-scanline `avail_out` gate
//! sequence. This backend deliberately does **not** do that: classic zlib's
//! verdict on adversarial streams depends on uninitialized window memory and
//! the exact output-gating schedule, which no other inflate implementation
//! reproduces. So [`inflate_idat`] ignores the `windows` schedule entirely,
//! concatenates the IDAT payloads, and does one whole-buffer inflate.
//!
//! This is correct for **every well-formed PNG** — the only images that round
//! trip through a real encoder — and is intentionally not bug-compatible with
//! spng on corrupt input. No differential fuzz target is built against it.

use super::{IdatInflate, StreamInflateError};
use zune_inflate::errors::{DecodeErrorStatus, InflateDecodeErrors};
use zune_inflate::{DeflateDecoder, DeflateOptions};

/// Whole-buffer zlib inflate, adler32 ignored (spng ignores the trailer) and
/// output bounded to `cap` bytes — both a DoS bound and spng's "stop at the
/// last needed byte" semantics. `cap` also sizes the output buffer up front so
/// a well-formed stream decodes without a single reallocation. zune checks
/// `produced > cap` strictly, so a stream producing exactly `cap` succeeds;
/// only a longer one trips [`DecodeErrorStatus::OutputLimitExceeded`] (whose
/// error still carries the `cap` bytes decoded so far).
fn inflate_capped(zlib: &[u8], cap: usize) -> Result<Vec<u8>, InflateDecodeErrors> {
    let opts = DeflateOptions::default()
        .set_confirm_checksum(false)
        .set_size_hint(cap)
        .set_limit(cap);
    DeflateDecoder::new_with_options(zlib, opts).decode_zlib()
}

/// Fast path: whole-buffer inflate of an already-gathered zlib stream into an
/// exactly-sized buffer. `Some(true)` only when it fills `out` exactly; any
/// other outcome (too short, surplus, or corrupt) returns `None` so the caller
/// falls back to [`inflate_idat`].
pub fn inflate_exact(zlib: &[u8], out: &mut [u8]) -> Option<bool> {
    match inflate_capped(zlib, out.len()) {
        Ok(v) if v.len() == out.len() => {
            out.copy_from_slice(&v);
            Some(true)
        }
        _ => None,
    }
}

/// Concatenate the IDAT payloads and inflate them into `out` in one shot. The
/// `windows` gate schedule is ignored (see module docs). Maps the decode result
/// onto spng's [`IdatInflate`] outcomes by produced length:
/// - fills `out` exactly, or has more output than `out` holds → `Done`
///   (spng stops at the last needed byte and ignores the rest);
/// - stream ends having produced fewer bytes → `TooShort`;
/// - truncated input → `NeedsInput` (no chunk supplied) / `TooShort`;
/// - anything else → `BadStream`.
pub fn inflate_idat<'a, I, W>(chunks: I, _windows: W, out: &mut [u8]) -> IdatInflate
where
    I: Iterator<Item = Option<&'a [u8]>>,
    W: Iterator<Item = usize>,
{
    let mut input: Vec<u8> = Vec::new();
    let mut had_input = false;
    // The walker yields Some(payload) per IDAT and None when no further chunk
    // can be supplied.
    for item in chunks {
        match item {
            Some(payload) => {
                input.extend_from_slice(payload);
                had_input = true;
            }
            None => break,
        }
    }

    match inflate_capped(&input, out.len()) {
        Ok(v) if v.len() == out.len() => {
            out.copy_from_slice(&v);
            IdatInflate::Done
        }
        // The stream ended before producing every byte spng wanted.
        Ok(_) => IdatInflate::TooShort,
        Err(e) => match e.error {
            // Output cap hit ⇒ the stream held at least `out.len()` bytes;
            // copy exactly those and discard the surplus, like spng.
            DecodeErrorStatus::OutputLimitExceeded(..) if e.data.len() >= out.len() => {
                out.copy_from_slice(&e.data[..out.len()]);
                IdatInflate::Done
            }
            // Input ran out mid-stream: the walker reports why no chunk could
            // be supplied when it never yielded one.
            DecodeErrorStatus::InsufficientData => {
                if had_input {
                    IdatInflate::TooShort
                } else {
                    IdatInflate::NeedsInput
                }
            }
            _ => IdatInflate::BadStream,
        },
    }
}

/// Inflate a complete embedded zlib stream (zTXt/iTXt/iCCP), growing the output
/// as needed and capping it at `max` (spng's chunk-size limit). Returns the
/// same [`StreamInflateError`] variants as the zlib backend.
pub fn inflate_stream(input: &[u8], max: u64) -> Result<Vec<u8>, StreamInflateError> {
    let limit = max.min(usize::MAX as u64) as usize;
    let opts = DeflateOptions::default()
        .set_confirm_checksum(false)
        .set_limit(limit);
    match DeflateDecoder::new_with_options(input, opts).decode_zlib() {
        Ok(v) => Ok(v),
        Err(e) => match e.error {
            DecodeErrorStatus::OutputLimitExceeded(..) => Err(StreamInflateError::Limit),
            _ => Err(StreamInflateError::Bad),
        },
    }
}

/// Compress `raw` to a zlib stream with `fdeflate`'s ultra-fast PNG-tuned
/// compressor (one deflate block, fixed Huffman trained on PNG residuals, RLE
/// of zeros). It is QOI-class fast and already lands ~27% under jsquash's size
/// on aggregate; the one caveat is non-zero-heavy residuals (rgba8 with alpha),
/// where the lack of general distance codes can regress the ratio above
/// jsquash.
///
/// fdeflate 0.3.x exposes no level knob, so `level` is ignored here — every
/// real deflate level maps to this single mode (level 0 / stored is handled in
/// `encode.rs`). Output is valid zlib and round-trips losslessly, which is the
/// encode contract (byte-identity to libdeflate is not a goal).
pub fn compress(raw: &[u8], _level: u8) -> Vec<u8> {
    fdeflate::compress_to_vec(raw)
}
