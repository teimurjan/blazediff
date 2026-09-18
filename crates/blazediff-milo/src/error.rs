//! What the metric refuses to do, and why.

/// Why MILO could not produce a score.
///
/// The messages match `blazediff-ssim`'s, so the front-ends that already
/// classify those ("Image sizes do not match" is a layout difference, not a
/// failure) can forward these verbatim.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MiloError {
    /// The two inputs are not the same size.
    SizeMismatch {
        img1_width: u32,
        img1_height: u32,
        img2_width: u32,
        img2_height: u32,
    },
    /// The input is smaller than the reference implementation accepts.
    InputTooSmall {
        width: u32,
        height: u32,
        minimum: u32,
    },
    /// The metric was configured with values it cannot honour.
    Options(String),
}

impl std::fmt::Display for MiloError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            MiloError::SizeMismatch {
                img1_width,
                img1_height,
                img2_width,
                img2_height,
            } => write!(
                f,
                "Image sizes do not match: {}x{} vs {}x{}",
                img1_width, img1_height, img2_width, img2_height
            ),
            MiloError::InputTooSmall {
                width,
                height,
                minimum,
            } => write!(
                f,
                "Image {}x{} is too small for this metric: needs at least {}x{}",
                width, height, minimum, minimum
            ),
            MiloError::Options(e) => write!(f, "Invalid metric options: {}", e),
        }
    }
}

impl std::error::Error for MiloError {}
