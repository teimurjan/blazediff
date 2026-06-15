//! Backend-agnostic result types shared by every deflate backend and their
//! callers (`decode.rs`, `chunks.rs`). The variants describe spng's decode
//! outcomes, not any particular inflate implementation, so both the zlib and
//! the pure-Rust backend map onto them.

/// Outcome of inflating the IDAT stream into an exactly-sized buffer.
pub enum IdatInflate {
    /// All `raw_len` bytes produced (anything after is ignored, like spng).
    Done,
    /// The zlib stream ended before producing every byte (SPNG_EIDAT_TOO_SHORT).
    TooShort,
    /// Corrupt zlib data (SPNG_EIDAT_STREAM).
    BadStream,
    /// The stream needed input no chunk could supply (SPNG_EIDAT_TOO_SHORT —
    /// the caller reports why the next chunk was unavailable).
    NeedsInput,
}

pub enum StreamInflateError {
    /// spng's recoverable SPNG_EZLIB (bad data / incomplete stream).
    Bad,
    /// Fatal SPNG_ECHUNK_LIMITS via the buffer-growth ladder.
    Limit,
}
