// The whole crate exists to compare against dssim, which is AGPL-3.0 where
// this repo is MIT. Gating the crate root on the feature means a default
// `cargo build --workspace` compiles nothing here and links no AGPL code.
// See licenses/DSSIM.md.
#![cfg(feature = "dssim")]
//! Shared machinery for the two SSIM benchmark binaries.
//!
//! - `blazediff-ssim-benchmark` — what each metric costs, over the repo fixtures.
//! - `blazediff-ssim-quality` — how well each metric predicts human opinion,
//!   over a subjective-quality dataset.
//!
//! Both need the same metric adapters and the same correlation statistics, so
//! they live here rather than being copied into each binary.

pub mod bench;
pub mod dataset;
pub mod metrics;
pub mod stats;
