//! Pluggable deflate backend.
//!
//! The codec is pure Rust everywhere except the inflate/compress seam, which
//! needs a zlib implementation. Two backends sit behind one set of free
//! functions (static dispatch, no trait objects):
//!
//! - [`zlib`] (default, `zlib-backend`): links the same system zlib spng
//!   links plus libdeflate, giving byte-exact spng decode parity including
//!   accept/reject behaviour on malformed streams.
//! - [`rust`] (`rust-backend`): pure-Rust — `zune-inflate` decode plus
//!   `fdeflate` ultra-fast compress. A C-free native option.
//!   Correct for every well-formed PNG, but **not** bug-compatible with spng on
//!   malformed/adversarial streams (see `rust.rs`).
//!
//! When both features are on, `zlib-backend` wins. The `lib.rs` compile guard
//! ensures at least one is selected.

mod shared;
pub use shared::{IdatInflate, StreamInflateError};

#[cfg(feature = "zlib-backend")]
mod zlib;
#[cfg(feature = "zlib-backend")]
pub use zlib::{compress, inflate_exact, inflate_idat, inflate_stream};

// strict-window reference inflate is a fuzzing-only, zlib-only concept.
#[cfg(feature = "fuzzing")]
pub use zlib::strict;

#[cfg(feature = "rust-backend")]
mod rust;
#[cfg(all(feature = "rust-backend", not(feature = "zlib-backend")))]
pub use rust::{compress, inflate_exact, inflate_idat, inflate_stream};
