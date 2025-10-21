# Hitchhiker's SSIM (Enhanced SSIM)

## Original Research

**Title:** A Hitchhiker's Guide to Structural Similarity
**Authors:** A. K. Venkataramanan, C. Wu, A. C. Bovik, I. Katsavounidis, Z. Shahid
**Published:** IEEE Access, vol. 9, pp. 28872-28896, 2021
**DOI:** [10.1109/ACCESS.2021.3056504](https://doi.org/10.1109/ACCESS.2021.3056504)

## Reference Implementation

C implementation: https://github.com/utlive/enhanced_ssim

## License

The reference C implementation is licensed under **BSD-2-Clause-Patent** (BSD+Patent):

**Copyright:** Netflix, Inc. (2020)

The implementation is forked from Netflix's VMAF repository. The University of Texas states the code is for educational purposes.

From the LICENSE file:
> Redistribution and use in source and binary forms, with or without modification, are permitted provided that the copyright notice and this license are retained.

> Contributors grant a perpetual, worldwide, non-exclusive, no-charge, royalty-free, irrevocable patent license for their contributions.

Full license: https://github.com/utlive/enhanced_ssim/blob/main/LICENSE

## Our Implementation

The TypeScript implementation in `@blazediff/ssim` is an independent implementation based on the published algorithm and uses:
- Integral images (summed area tables) for O(1) window computation
- Rectangular windows instead of Gaussian windows
- Coefficient of Variation (CoV) pooling for spatial aggregation
- Standard SSIM formula as described in the paper

Our code is licensed under MIT.

## Citation

```bibtex
@article{venkataramanan2021hitchhiker,
  title={A Hitchhiker's Guide to Structural Similarity},
  author={Venkataramanan, A. K. and Wu, C. and Bovik, A. C. and Katsavounidis, I. and Shahid, Z.},
  journal={IEEE Access},
  volume={9},
  pages={28872--28896},
  year={2021},
  publisher={IEEE},
  doi={10.1109/ACCESS.2021.3056504}
}
```
