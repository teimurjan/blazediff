"""Benchmark blazediff (PyO3) compare()."""

from __future__ import annotations

from blazediff import compare

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
        results.append(run_bench(
            f"blazediff - {pair.name}",
            lambda a=a, b=b: compare(a, b),
            args.iterations,
        ))

    report(results, "🔥 BlazeDiff (PyO3) Benchmark Results:", args.format, args.output)


if __name__ == "__main__":
    main()
