//! PNG I/O.
//!
//! The codec itself lives in [`blazediff_shared`] so that `blazediff-ssim` can
//! share it without depending on this crate. These wrappers exist only to
//! return [`DiffError`], keeping one error type across the whole public API.

use crate::types::{DiffError, Image};
use std::path::Path;

pub fn load_png<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    Ok(blazediff_shared::load_png(path)?)
}

pub fn load_pngs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::load_pngs(path1, path2)?)
}

pub fn decode_png(file_data: &[u8]) -> Result<Image, DiffError> {
    Ok(blazediff_shared::decode_png(file_data)?)
}

pub fn save_png<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), DiffError> {
    Ok(blazediff_shared::save_png(image, path)?)
}

pub fn save_png_with_compression<P: AsRef<Path>>(
    image: &Image,
    path: P,
    compression: u8,
) -> Result<(), DiffError> {
    Ok(blazediff_shared::save_png_with_compression(
        image,
        path,
        compression,
    )?)
}

pub fn encode_png(image: &Image, compression_level: i32) -> Result<Vec<u8>, DiffError> {
    Ok(blazediff_shared::encode_png(image, compression_level)?)
}
