//! spng-equivalent metadata model: a typed value for every standard
//! ancillary chunk plus unknown-chunk passthrough, captured on
//! [`decode_with_metadata`](crate::decode_with_metadata) and emitted by
//! [`encode_with_metadata`](crate::encode_with_metadata).
//!
//! Field shapes mirror libspng's `spng_*` structs so capture can be checked
//! field-for-field against `spng_get_*` (the differential parity contract).
//! Type-tagged unions in spng (`bKGD`, `tRNS`) become Rust enums; everything
//! else maps one-to-one. Compressed payloads (`iCCP`, `zTXt`, compressed
//! `iTXt`) are stored *decompressed*, exactly like spng's getters return them.

/// Chromaticities (`cHRM`), stored as the raw `chrm_int` form: each field is
/// the spec's value × 100000.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Chrm {
    pub white_x: u32,
    pub white_y: u32,
    pub red_x: u32,
    pub red_y: u32,
    pub green_x: u32,
    pub green_y: u32,
    pub blue_x: u32,
    pub blue_y: u32,
}

/// Embedded ICC profile (`iCCP`); `profile` is the decompressed bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Iccp {
    /// Latin-1 profile name (1..=79 bytes, no NUL).
    pub name: Vec<u8>,
    pub profile: Vec<u8>,
}

/// Significant bits (`sBIT`). Only the channels relevant to the image's
/// color type are meaningful; the rest are zero (matching spng's struct).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Sbit {
    pub grayscale: u8,
    pub red: u8,
    pub green: u8,
    pub blue: u8,
    pub alpha: u8,
}

/// Which textual chunk a [`Text`] entry came from / is written as.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextKind {
    /// `tEXt` — uncompressed Latin-1.
    Text,
    /// `zTXt` — zlib-compressed Latin-1.
    Ztxt,
    /// `iTXt` — UTF-8, optionally compressed.
    Itxt,
}

/// A textual annotation (`tEXt` / `zTXt` / `iTXt`). `text` is always the
/// decompressed content; `language_tag` / `translated_keyword` are `iTXt`
/// only (empty otherwise).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Text {
    pub kind: TextKind,
    /// Latin-1 keyword (1..=79 bytes, no NUL).
    pub keyword: Vec<u8>,
    pub text: Vec<u8>,
    /// `iTXt`: whether the text is stored compressed in the chunk.
    pub compressed: bool,
    pub language_tag: Vec<u8>,
    pub translated_keyword: Vec<u8>,
}

/// Background color (`bKGD`), tagged by the image's color type.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bkgd {
    /// Grayscale / grayscale-alpha: a single gray sample.
    Gray(u16),
    /// Truecolor / truecolor-alpha: an RGB triple.
    Rgb(u16, u16, u16),
    /// Indexed: a palette index.
    Palette(u8),
}

/// Physical pixel dimensions (`pHYs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Phys {
    pub ppu_x: u32,
    pub ppu_y: u32,
    /// 0 = unknown aspect ratio, 1 = meter.
    pub unit: u8,
}

/// One suggested-palette entry (`sPLT`). Samples are 16-bit regardless of the
/// chunk's sample depth (8-bit entries are stored as-is in the low byte).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpltEntry {
    pub red: u16,
    pub green: u16,
    pub blue: u16,
    pub alpha: u16,
    pub frequency: u16,
}

/// Suggested palette (`sPLT`). Multiple are allowed per image.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Splt {
    /// Latin-1 palette name (1..=79 bytes, no NUL).
    pub name: Vec<u8>,
    /// 8 or 16.
    pub sample_depth: u8,
    pub entries: Vec<SpltEntry>,
}

/// Last-modification time (`tIME`), UTC.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Time {
    pub year: u16,
    pub month: u8,
    pub day: u8,
    pub hour: u8,
    pub minute: u8,
    pub second: u8,
}

/// Image offset (`oFFs`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Offs {
    pub x: i32,
    pub y: i32,
    /// 0 = pixel, 1 = micrometer.
    pub unit: u8,
}

/// Explicit palette (`PLTE`) for encoding: entry order is preserved verbatim,
/// overriding the encoder's first-seen auto-derivation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Palette {
    /// 1..=256 RGB entries.
    pub entries: Vec<[u8; 3]>,
}

/// Transparency (`tRNS`), tagged by color type.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Trns {
    /// Grayscale color-key (raw 16-bit sample).
    Gray(u16),
    /// Truecolor color-key (raw 16-bit RGB).
    Rgb(u16, u16, u16),
    /// Per-palette-entry alpha (length <= palette length).
    Palette(Vec<u8>),
}

/// Position of an unknown chunk relative to the critical chunks, mirroring
/// spng's `enum spng_location`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Location {
    /// Between IHDR and PLTE.
    AfterIhdr,
    /// Between PLTE and the first IDAT.
    AfterPlte,
    /// After the IDAT run (before IEND).
    AfterIdat,
}

/// An ancillary chunk the codec does not model, preserved verbatim.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UnknownChunk {
    pub kind: [u8; 4],
    pub data: Vec<u8>,
    pub location: Location,
}

/// All non-pixel chunk data for one image. `Default` is "no metadata".
///
/// `palette` / `transparency` are populated on decode and, on encode, used
/// verbatim when the resolved color mode is indexed (the `spng_set_plte` /
/// `spng_set_trns` path); leave them `None` to keep the encoder's
/// auto-derived palette.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Metadata {
    pub palette: Option<Palette>,
    pub transparency: Option<Trns>,
    pub chrm: Option<Chrm>,
    /// `gAMA`: gamma × 100000.
    pub gama: Option<u32>,
    pub iccp: Option<Iccp>,
    pub sbit: Option<Sbit>,
    /// `sRGB` rendering intent (0..=3).
    pub srgb: Option<u8>,
    pub text: Vec<Text>,
    pub bkgd: Option<Bkgd>,
    /// `hIST`: one frequency per palette entry.
    pub hist: Option<Vec<u16>>,
    pub phys: Option<Phys>,
    pub splt: Vec<Splt>,
    pub time: Option<Time>,
    pub offs: Option<Offs>,
    /// `eXIf` payload (Exif TIFF stream, no length prefix).
    pub exif: Option<Vec<u8>>,
    pub unknown: Vec<UnknownChunk>,
}

impl Metadata {
    /// True when nothing would be written — encode can skip the metadata path.
    pub fn is_empty(&self) -> bool {
        *self == Metadata::default()
    }
}
