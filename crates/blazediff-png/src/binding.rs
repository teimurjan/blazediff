//! Option parsing shared by the N-API and wasm bindings, so both packages take
//! the same `{ compression, filter, color }` shape and reject the same inputs.

use crate::{ColorMode, EncodeOptions, Filter};

/// Encode options from the JS side. `None` keeps the crate default (level 4,
/// adaptive filtering, smallest lossless color mode).
pub fn encode_options(
    compression: Option<u8>,
    filter: Option<&str>,
    color: Option<&str>,
) -> Result<EncodeOptions, String> {
    let mut options = EncodeOptions::default();
    if let Some(level) = compression {
        if level > 12 {
            return Err(format!("compression must be 0-12, got {level}"));
        }
        options.compression = level;
    }
    if let Some(name) = filter {
        options.filter = parse_filter(name)?;
    }
    if let Some(name) = color {
        options.color = parse_color(name)?;
    }
    Ok(options)
}

fn parse_color(name: &str) -> Result<ColorMode, String> {
    match name {
        "auto" => Ok(ColorMode::Auto),
        "rgba8" => Ok(ColorMode::Rgba8),
        other => Err(format!("unknown color \"{other}\"; expected auto or rgba8")),
    }
}

fn parse_filter(name: &str) -> Result<Filter, String> {
    match name {
        "none" => Ok(Filter::None),
        "sub" => Ok(Filter::Sub),
        "up" => Ok(Filter::Up),
        "average" => Ok(Filter::Average),
        "paeth" => Ok(Filter::Paeth),
        "adaptive" => Ok(Filter::Adaptive),
        other => Err(format!(
            "unknown filter \"{other}\"; expected none, sub, up, average, paeth or adaptive"
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_overrides() {
        let default = encode_options(None, None, None).unwrap();
        assert_eq!(default.compression, EncodeOptions::default().compression);
        assert_eq!(default.filter, Filter::Adaptive);
        assert_eq!(default.color, ColorMode::Auto);

        let custom = encode_options(Some(0), Some("none"), Some("rgba8")).unwrap();
        assert_eq!(custom.compression, 0);
        assert_eq!(custom.filter, Filter::None);
        assert_eq!(custom.color, ColorMode::Rgba8);
    }

    #[test]
    fn rejects_bad_input() {
        assert!(encode_options(Some(13), None, None).is_err());
        assert!(encode_options(None, Some("fast"), None).is_err());
        assert!(encode_options(None, None, Some("rgb8")).is_err());
    }
}
