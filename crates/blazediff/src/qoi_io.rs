//! QOI I/O.
//!
//! Thin [`DiffError`] wrappers over [`blazediff_shared`]; see [`crate::io`].

use crate::types::{DiffError, Image};
use std::path::Path;

pub fn load_qoi<P: AsRef<Path>>(path: P) -> Result<Image, DiffError> {
    Ok(blazediff_shared::load_qoi(path)?)
}

pub fn load_qois<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    Ok(blazediff_shared::load_qois(path1, path2)?)
}

pub fn decode_qoi(file_data: &[u8]) -> Result<Image, DiffError> {
    Ok(blazediff_shared::decode_qoi(file_data)?)
}

pub fn save_qoi<P: AsRef<Path>>(image: &Image, path: P) -> Result<(), DiffError> {
    Ok(blazediff_shared::save_qoi(image, path)?)
}
