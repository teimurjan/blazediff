use blazediff::{
    load_jpeg, load_jpegs, load_png, load_pngs, load_qoi, load_qois, DiffError, Image,
};
use rayon::prelude::*;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq)]
enum ImageFormat {
    Png,
    Jpeg,
    Qoi,
}

impl ImageFormat {
    fn from_path<P: AsRef<Path>>(path: P) -> Option<Self> {
        let ext = path.as_ref().extension()?.to_str()?.to_lowercase();
        match ext.as_str() {
            "png" => Some(Self::Png),
            "jpg" | "jpeg" => Some(Self::Jpeg),
            "qoi" => Some(Self::Qoi),
            _ => None,
        }
    }

    fn load<P: AsRef<Path>>(self, path: P) -> Result<Image, DiffError> {
        match self {
            Self::Png => load_png(path),
            Self::Jpeg => load_jpeg(path),
            Self::Qoi => load_qoi(path),
        }
    }

    fn load_pair<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
        self,
        path1: P1,
        path2: P2,
    ) -> Result<(Image, Image), DiffError> {
        match self {
            Self::Png => load_pngs(path1, path2),
            Self::Jpeg => load_jpegs(path1, path2),
            Self::Qoi => load_qois(path1, path2),
        }
    }
}

pub fn load_images<P1: AsRef<Path> + Sync, P2: AsRef<Path> + Sync>(
    path1: P1,
    path2: P2,
) -> Result<(Image, Image), DiffError> {
    let fmt1 = ImageFormat::from_path(&path1).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path1.as_ref().display()))
    })?;
    let fmt2 = ImageFormat::from_path(&path2).ok_or_else(|| {
        DiffError::UnsupportedFormat(format!("Unsupported format: {}", path2.as_ref().display()))
    })?;

    if fmt1 == fmt2 {
        return fmt1.load_pair(&path1, &path2);
    }

    let results: Vec<Result<Image, DiffError>> = [
        (path1.as_ref().to_path_buf(), fmt1),
        (path2.as_ref().to_path_buf(), fmt2),
    ]
    .par_iter()
    .map(|(path, fmt)| fmt.load(path))
    .collect();

    let mut iter = results.into_iter();
    Ok((iter.next().unwrap()?, iter.next().unwrap()?))
}
