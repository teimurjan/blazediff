//! JPEG I/O.
//!
//! Thin [`DiffError`] wrappers over [`blazediff_shared`]; see [`crate::io`].

use crate::types::{DiffError, Image};
use std::path::Path;

pub fn load_jpeg<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    Ok(blazediff_shared::load_jpeg(path)?)
}

pub fn load_jpegs<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::load_jpegs(path1, path2)?)
}

pub fn decode_jpeg(file_data: &[u8]) -> Result<Image, DiffError> {
    Ok(blazediff_shared::decode_jpeg(file_data)?)
}

pub fn save_jpeg<P: AsRef<Path>>(image: &Image, path: P, quality: u8) -> Result<(), DiffError> {
    Ok(blazediff_shared::save_jpeg(image, path, quality)?)
}
