# MILO

## Original Research

**Title:** MILO: A Lightweight Perceptual Quality Metric for Image and Latent-Space Optimization
**Authors:** Uğur Çoğalan, Mojtaba Bemana, Karol Myszkowski, Hans-Peter Seidel, Colin Groth
**Published:** ACM Transactions on Graphics, vol. 44, no. 6, 2025 (SIGGRAPH Asia 2025)
**DOI:** [10.1145/3763340](https://doi.org/10.1145/3763340)
**Preprint:** [arXiv:2509.01411](https://arxiv.org/abs/2509.01411)
**Project page:** https://milo.mpi-inf.mpg.de/

## Reference Implementation and Weights

PyTorch implementation and trained checkpoint: https://github.com/ugurcogalan06/MILO

## License

The reference implementation and the `MILO.pth` checkpoint are licensed under **Apache-2.0**:

**Copyright:** 2025 Uğur Çoğalan, Mojtaba Bemana, Karol Myszkowski, Hans-Peter Seidel, Colin Groth

Full license: https://github.com/ugurcogalan06/MILO/blob/main/LICENSE

## What Ships

The `blazediff-milo` crate (and the `@blazediff/milo-native`, `@blazediff/milo-wasm` and
`blazediff-milo` PyPI packages built from it) embeds the trained parameters of `MILO.pth` at
`crates/blazediff-milo/src/weights/milo.bin`: every tensor of the checkpoint's state_dict, in
order, as little-endian float32. The blob is a verbatim re-encoding of the checkpoint, exported by
`crates/blazediff-milo/scripts/export-reference.py` from the upstream repository at commit
`4f5b6fc641cae1a8aeaa8c4f04296dcad388b867` (checkpoint SHA-256
`a1d66a7e0ebe0f839564ad70160ffdec709708f0b9a7dd03b19c0bee90d31f79`). No fine-tuning, pruning or
quantisation has been applied. Apache-2.0 permits this redistribution; this file is the attribution
it requires.

The latent-space variant (`MILO_latent.pth`) is not included.

## Our Implementation

The Rust code in the `blazediff-milo` crate is an independent implementation of the published
network (pyramid, mask finder, residual masks, masked-error pooling and MOS scaler), written from
the reference `MILO_runner.py` and held to its outputs by `crates/blazediff-milo/tests/parity.rs`.
Our code is licensed under MIT.

## Citation

```bibtex
@article{cogalan2025milo,
  title={MILO: A Lightweight Perceptual Quality Metric for Image and Latent-Space Optimization},
  author={{\c{C}}o{\u{g}}alan, U{\u{g}}ur and Bemana, Mojtaba and Myszkowski, Karol and Seidel, Hans-Peter and Groth, Colin},
  journal={ACM Transactions on Graphics},
  volume={44},
  number={6},
  year={2025},
  publisher={ACM},
  doi={10.1145/3763340}
}
```
