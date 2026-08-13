# KADID-10k

## What it is

The Konstanz Artificially Distorted Image quality Database — 81 pristine
reference images, each degraded by 25 distortion types at 5 severity levels
(10125 distorted images), every one carrying a mean opinion score collected
from crowd workers.

Used by `crates/blazediff-ssim-quality` as the ground truth for "does this
metric agree with people". Without a dataset like it there is no way to make a
quality claim about an image-quality metric at all — matching a reference
implementation proves fidelity, not perceptual accuracy.

## Source and terms

http://database.mmsp-kn.org/kadid-10k-database.html

Free for research and educational use. Publishing numbers derived from it
requires citing:

> H. Lin, V. Hosu, D. Saupe. "KADID-10k: A Large-scale Artificially Distorted
> IQA Database." 11th International Conference on Quality of Multimedia
> Experience (QoMEX), 2019.

## How this repo uses it

- **Nothing is committed.** `scripts/fetch-kadid10k.sh` downloads it on demand
  into a gitignored `.datasets/` directory; no dataset image or score ever
  enters the repository.
- The harness reads it, computes correlations, and prints them. It does not
  redistribute the images, and it does not derive any shipped artifact from
  them — no BlazeDiff metric is trained or tuned on this data.

If tuning against it ever starts (fitting weights to maximise correlation),
that is the point at which held-out validation on a second database — TID2013,
CSIQ, LIVE — becomes mandatory, or the numbers are just overfitting.
