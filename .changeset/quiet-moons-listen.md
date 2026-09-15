---
"@blazediff/agent": minor
---

Add `--model` to the local judge and rename the `host` judge backend to `agent`.

The local judge can now read changed regions through a locally managed
[Moondream Station](https://docs.moondream.ai/station/) instead of an in-process
ONNX session. Station reaches Apple Silicon's GPU, which onnxruntime-node cannot
for this model, cutting a region read from ~11s to ~2s. It is installed (via
`uv`), launched, warmed and stopped by the judge — or attaches to a Station you
already run and leaves it alone.

`--model` applies only to `--judge local` and takes `moondream-2-2b-onnx`
(default, the previous in-process behaviour, portable) or `moondream-3-9b-mlx`
(Apple Silicon, ~16GB RAM). Passing it to another backend is an error.

`--judge host` is now `--judge agent`. Both `host` and the older `moondream`
still parse as aliases, so existing `.blazediff/config.json` files and scripts
keep working.
