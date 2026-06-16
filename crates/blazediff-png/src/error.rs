//! Typed errors mirroring libspng's error classes. The decoder's accept /
//! reject behavior must match spng exactly; the variants below partition the
//! same failure space so tests can assert *why* an input was rejected.

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PngError {
    /// Missing or malformed 8-byte PNG signature (SPNG_ESIGNATURE).
    Signature,
    /// First chunk is not IHDR or IHDR length != 13 (SPNG_ENOIHDR / EIHDR_SIZE).
    NoIhdr,
    /// Invalid IHDR field (SPNG_EWIDTH/EHEIGHT/EBIT_DEPTH/ECOLOR_TYPE/
    /// ECOMPRESSION_METHOD/EFILTER_METHOD/EINTERLACE_METHOD).
    InvalidIhdr,
    /// Input ended where spng would attempt a read (chunk header, payload,
    /// or the 4 CRC bytes spng reads without verifying).
    UnexpectedEof,
    /// Chunk length exceeds the PNG standard's 2^31-1 limit (SPNG_ECHUNK_STDLEN).
    ChunkStdLen,
    /// Critical chunk in an invalid position: duplicate IHDR, IEND before
    /// IDAT, PLTE after tRNS/hIST/bKGD, IDAT restarting after other chunks
    /// (SPNG_ECHUNK_POS).
    ChunkPos,
    /// Critical chunk with an invalid size, e.g. PLTE length not a multiple
    /// of 3 or an empty/oversized palette (SPNG_ECHUNK_SIZE).
    ChunkSize,
    /// Unknown critical chunk (SPNG_ECHUNK_UNKNOWN_CRITICAL).
    UnknownCritical,
    /// Indexed-color image reached IDAT without a PLTE chunk (SPNG_ENOPLTE).
    NoPlte,
    /// Cumulative chunk count or cache limits exceeded (SPNG_ECHUNK_LIMITS).
    ChunkLimits,
    /// The inflated image stream ended before producing every scanline
    /// (SPNG_EIDAT_TOO_SHORT).
    IdatTooShort,
    /// Corrupt zlib/deflate data in the image stream (SPNG_EIDAT_STREAM).
    IdatStream,
    /// Scanline declared a filter type > 4 (SPNG_EFILTER).
    Filter,
    /// Pixel buffer allocation failed (SPNG_EMEM).
    OutOfMemory,
    /// Arithmetic overflow computing buffer sizes (SPNG_EOVERFLOW).
    Overflow,
    /// Encoder-only: the image cannot be losslessly represented with the
    /// requested color type / bit depth.
    Unrepresentable(&'static str),
    /// Encoder-only: invalid encode options.
    InvalidOptions(&'static str),
    /// Requested decode output format is incompatible with the image's color
    /// type / bit depth (SPNG_EFMT): G8/GA8 need grayscale depth <= 8, GA16
    /// grayscale depth 16.
    UnsupportedFormat,
    /// Encoder-only: the destination writer failed during a streaming
    /// [`crate::encode_to`]. Carries the underlying [`std::io::ErrorKind`]
    /// (the kind, not the value, keeps `PngError` `Clone`/`Eq`).
    Io(std::io::ErrorKind),
}

impl From<std::io::Error> for PngError {
    fn from(e: std::io::Error) -> Self {
        PngError::Io(e.kind())
    }
}

impl std::fmt::Display for PngError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PngError::Signature => write!(f, "invalid PNG signature"),
            PngError::NoIhdr => write!(f, "missing or malformed IHDR chunk"),
            PngError::InvalidIhdr => write!(f, "invalid IHDR field"),
            PngError::UnexpectedEof => write!(f, "unexpected end of input"),
            PngError::ChunkStdLen => write!(f, "chunk length exceeds 2^31-1"),
            PngError::ChunkPos => write!(f, "critical chunk in invalid position"),
            PngError::ChunkSize => write!(f, "critical chunk has invalid size"),
            PngError::UnknownCritical => write!(f, "unknown critical chunk"),
            PngError::NoPlte => write!(f, "indexed image missing PLTE"),
            PngError::ChunkLimits => write!(f, "chunk count or cache limit exceeded"),
            PngError::IdatTooShort => write!(f, "image stream ended early"),
            PngError::IdatStream => write!(f, "corrupt image stream"),
            PngError::Filter => write!(f, "invalid scanline filter type"),
            PngError::OutOfMemory => write!(f, "pixel buffer allocation failed"),
            PngError::Overflow => write!(f, "size computation overflow"),
            PngError::Unrepresentable(why) => write!(f, "image not representable: {}", why),
            PngError::InvalidOptions(why) => write!(f, "invalid encode options: {}", why),
            PngError::UnsupportedFormat => {
                write!(f, "decode format incompatible with image color type/depth")
            }
            PngError::Io(kind) => write!(f, "writer failed during encode: {}", kind),
        }
    }
}

impl std::error::Error for PngError {}
