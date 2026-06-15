//! Shared helpers for the blazediff fuzz targets.

use std::sync::Once;

/// Mirrors `-max_len` so artifact replay without libFuzzer flags stays safe.
pub const MAX_INPUT_LEN: usize = 4 * 1024 * 1024;

/// Max W*H any IHDR may declare: 4M px = 16 MB RGBA per decode. fast_png_io
/// itself only caps the raw filtered stream at 2^31 bytes, which for 1-bpp
/// color types (gray/indexed) still permits ~8 GB of RGBA output.
pub const MAX_PIXELS: u64 = 4_000_000;

const PNG_SIG: [u8; 8] = [0x89, b'P', b'N', b'G', b'\r', b'\n', 0x1a, b'\n'];

/// Pin rayon's global pool to one thread: deterministic execs, no thread
/// spawn/teardown noise under ASan. build_global errors harmlessly if the
/// pool already exists, hence the ignored Result.
pub fn init() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let _ = rayon::ThreadPoolBuilder::new().num_threads(1).build_global();
    });
}

/// Walk chunks the same way fast_png_io::parse_chunks does (lenient: last IHDR
/// wins, stop at IEND, bail on truncation) and reject if any IHDR would
/// commit decode() to more than MAX_PIXELS pixels. Returns true for non-PNG
/// or truncated data because decode() rejects those cheaply itself.
pub fn dims_within_budget(data: &[u8]) -> bool {
    if data.len() < 8 || data[..8] != PNG_SIG {
        return true;
    }
    let mut pos = 8usize;
    while pos + 8 <= data.len() {
        let len = u32::from_be_bytes(data[pos..pos + 4].try_into().unwrap()) as usize;
        let payload_end = pos + 8 + len;
        if payload_end + 4 > data.len() {
            return true;
        }
        let ty = &data[pos + 4..pos + 8];
        if ty == b"IHDR" && len == 13 {
            let w = u32::from_be_bytes(data[pos + 8..pos + 12].try_into().unwrap()) as u64;
            let h = u32::from_be_bytes(data[pos + 12..pos + 16].try_into().unwrap()) as u64;
            if w * h > MAX_PIXELS {
                return false;
            }
        }
        if ty == b"IEND" {
            break;
        }
        pos = payload_end + 4; // skip crc
    }
    true
}
