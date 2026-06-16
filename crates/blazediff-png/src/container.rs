//! PNG container framing: signature, CRC-checked chunk emission, and a
//! streaming IDAT writer. Mechanical only — this module knows nothing about
//! pixels, color modes, or row filters; it accepts byte sources from `encode`.

use std::io::{self, Write};

use crate::chunks::PNG_SIG;

/// Write the 8-byte PNG signature.
#[inline]
pub fn write_signature<W: Write>(out: &mut W) -> io::Result<()> {
    out.write_all(&PNG_SIG)
}

/// Emit one complete chunk: 4-byte big-endian length, 4-byte type, payload,
/// and CRC32 over type + payload.
pub fn write_chunk<W: Write>(out: &mut W, ty: &[u8; 4], payload: &[u8]) -> io::Result<()> {
    out.write_all(&(payload.len() as u32).to_be_bytes())?;
    out.write_all(ty)?;
    out.write_all(payload)?;
    let mut h = crc32fast::Hasher::new();
    h.update(ty);
    h.update(payload);
    out.write_all(&h.finalize().to_be_bytes())
}

/// Streaming writer for a single IDAT chunk whose total payload length is known
/// up front. The stored-block encoder computes that length analytically, so it
/// can frame the chunk header immediately, stream payload bytes in pieces with
/// a running CRC, and append the CRC trailer at [`finish`] — without ever
/// buffering the whole payload.
pub struct IdatStreamer<'w, W: Write> {
    out: &'w mut W,
    crc: crc32fast::Hasher,
    remaining: usize,
}

impl<'w, W: Write> IdatStreamer<'w, W> {
    /// Begin a chunk by writing the length prefix and `IDAT` type. `payload_len`
    /// must be the exact number of bytes the caller will [`write`] before
    /// [`finish`] and stay within the PNG 2 GB chunk limit.
    pub fn new(out: &'w mut W, payload_len: u32) -> io::Result<Self> {
        out.write_all(&payload_len.to_be_bytes())?;
        out.write_all(b"IDAT")?;
        let mut crc = crc32fast::Hasher::new();
        crc.update(b"IDAT");
        Ok(Self {
            out,
            crc,
            remaining: payload_len as usize,
        })
    }

    /// Stream a slice of payload bytes, folding them into the running CRC.
    /// Errors before writing anything if the slice would exceed the declared
    /// payload length, so a miscomputed length can never frame a chunk whose
    /// body overruns its prefix.
    #[inline]
    pub fn write(&mut self, bytes: &[u8]) -> io::Result<()> {
        self.remaining = self.remaining.checked_sub(bytes.len()).ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidInput,
                "IDAT write exceeds declared payload length",
            )
        })?;
        self.out.write_all(bytes)?;
        self.crc.update(bytes);
        Ok(())
    }

    /// Finish the chunk by writing the CRC trailer. Errors if fewer bytes were
    /// written than declared, since the length prefix would then misframe the
    /// chunk.
    pub fn finish(self) -> io::Result<()> {
        if self.remaining != 0 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "IDAT payload shorter than declared length",
            ));
        }
        self.out.write_all(&self.crc.finalize().to_be_bytes())
    }
}
