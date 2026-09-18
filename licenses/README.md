# Algorithm Licenses

This directory contains license attributions for the perceptual quality metrics in `@blazediff/ssim`, the `blazediff-ssim` crate and the `blazediff-milo` crate, and for the third-party material the benchmarks compare against.

## Implemented algorithms

- **[SSIM.md](./SSIM.md)** - Zhou Wang et al., IEEE 2004
- **[MS-SSIM.md](./MS-SSIM.md)** - Zhou Wang et al., Asilomar 2003
- **[HITCHHIKERS-SSIM.md](./HITCHHIKERS-SSIM.md)** - Venkataramanan et al., IEEE Access 2021
- **[MILO.md](./MILO.md)** - Çoğalan et al., ACM TOG 2025. The only learned metric: its Apache-2.0 trained weights ship inside the `blazediff-milo` crate

## Benchmark-only material

Neither of these ships in any BlazeDiff artifact; both are used only by `crates/blazediff-ssim-benchmark`.

- **[DSSIM.md](./DSSIM.md)** - the dssim crate (AGPL-3.0), an opt-in benchmark competitor
- **[KADID-10K.md](./KADID-10K.md)** - the subjective-quality dataset the quality harness scores against

## Our Implementation

All code in `@blazediff/ssim`, the `blazediff-ssim` crate and the `blazediff-milo` crate is licensed under MIT. The algorithms themselves are based on published research with the licensing noted in each file above; MILO's embedded weights stay under their own Apache-2.0 license.

## Commercial Use

For SSIM/MS-SSIM commercial use, contact original authors for clarification.
