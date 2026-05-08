"""Benchmark OpenCV cv2.absdiff baseline (grayscale)."""

from __future__ import annotations

import cv2
import numpy as np

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
            img_a = cv2.imread(a, cv2.IMREAD_GRAYSCALE)
            img_b = cv2.imread(b, cv2.IMREAD_GRAYSCALE)
            diff = cv2.absdiff(img_a, img_b)
            _ = np.count_nonzero(diff)

        results.append(run_bench(f"opencv-absdiff - {pair.name}", _do, args.iterations))

    report(results, "🎯 OpenCV absdiff Benchmark Results:", args.format, args.output)


if __name__ == "__main__":
    main()
