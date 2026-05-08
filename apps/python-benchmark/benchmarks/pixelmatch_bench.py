"""Benchmark pixelmatch (pypi) — PIL-based pixel-by-pixel diff."""

from __future__ import annotations

from PIL import Image
from pixelmatch.contrib.PIL import pixelmatch

from ._common import (
    get_benchmark_image_pairs,
    parse_args,
    report,
    run_bench,
)


def main() -> None:
    args = parse_args()
    pairs = get_benchmark_image_pairs(args.fixtures)

    results = []
    for pair in pairs:
        a, b = str(pair.a), str(pair.b)

        def _do(a=a, b=b):
            img_a = Image.open(a).convert("RGBA")
            img_b = Image.open(b).convert("RGBA")
            pixelmatch(img_a, img_b, threshold=0.1)

        results.append(run_bench(f"pixelmatch - {pair.name}", _do, args.iterations))

    report(results, "🔍 pixelmatch Benchmark Results:", args.format, args.output)


if __name__ == "__main__":
    main()
