# @blazediff/python-benchmark

Python image-diff benchmarks comparing the new `blazediff` PyPI package (PyO3 bindings to the Rust core) against [`pixelmatch`](https://pypi.org/project/pixelmatch/) and an OpenCV `cv2.absdiff` baseline.

All three benchmarks run on the same `/fixtures/` PNG pairs and produce the same JSON shape as `apps/image-benchmark`. Timings include PNG decode, since `blazediff.compare` is path-based - the comparison is meaningful **across the three Python targets**, not against the JS image-benchmark numbers.

## Setup

Requires [`uv`](https://docs.astral.sh/uv/) and Rust toolchain (for building the local blazediff wheel).

```sh
bash apps/python-benchmark/scripts/setup.sh
```

This creates `apps/python-benchmark/.venv/`, installs `pixelmatch`, `opencv-python`, `pillow`, `numpy`, then builds and installs the local `blazediff` wheel from `crates/blazediff/`.

## Run

From the repo root:

```sh
pnpm benchmark:python-blazediff   --fixtures=pixelmatch --iterations=10
pnpm benchmark:python-pixelmatch  --fixtures=pixelmatch --iterations=10
pnpm benchmark:python-opencv      --fixtures=pixelmatch --iterations=10
```

CLI flags (same as `apps/image-benchmark`):

- `--iterations=N` - number of timed iterations per pair (default: 25)
- `--fixtures=A,B,C` - comma-separated fixture subdirs (default: all)
- `--format=markdown|json` - output format (default: markdown to stdout)
- `--output=FILE` - JSON output path (used with `--format=json`)
