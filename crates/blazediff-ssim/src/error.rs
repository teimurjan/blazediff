//! What a metric refuses to do, and why.

/// Why a metric could not produce a score.
///
/// The messages are the ones blazediff's front-ends have always printed, so a
/// caller wrapping this in its own error type can forward them verbatim.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SsimError {
    /// The two inputs are not the same size.
    SizeMismatch {
        img1_width: u32,
        img1_height: u32,
        img2_width: u32,
        img2_height: u32,
    },
    /// The input is smaller than the chosen metric can work on.
    InputTooSmall {
        width: u32,
        height: u32,
        minimum: u32,
    },
    /// The metric was configured with values it cannot honour.
    Options(String),
}

impl std::fmt::Display for SsimError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SsimError::SizeMismatch {
                img1_width,
                img1_height,
                img2_width,
                img2_height,
            } => write!(
                f,
                "Image sizes do not match: {}x{} vs {}x{}",
                img1_width, img1_height, img2_width, img2_height
            ),
            SsimError::InputTooSmall {
                width,
                height,
                minimum,
            } => write!(
                f,
                "Image {}x{} is too small for this metric: needs at least {}x{}",
                width, height, minimum, minimum
            ),
            SsimError::Options(e) => write!(f, "Invalid metric options: {}", e),
        }
    }
}

impl std::error::Error for SsimError {}
