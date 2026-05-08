"""Shared helpers for the Python image-diff benchmarks.

Mirrors `apps/image-benchmark/src/utils.ts` so output shape is comparable
across the JS and Python suites.
"""

from __future__ import annotations

import argparse
import json
import random
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

ALL_PIXEL_FIXTURE_DIRS = ("pixelmatch", "blazediff", "4k", "page", "same")


@dataclass(frozen=True)
class ImagePair:
    a: Path
    b: Path
    name: str


@dataclass(frozen=True)
class Args:
    iterations: int
    format: str
    output: str
    fixtures: list[str] | None


def _repo_root() -> Path:
    # apps/python-benchmark/benchmarks/_common.py → repo root
    return Path(__file__).resolve().parents[3]


def fixtures_dir() -> Path:
    return _repo_root() / "fixtures"


def parse_args() -> Args:
    p = argparse.ArgumentParser()
    p.add_argument("--iterations", type=int, default=25)
    p.add_argument("--format", choices=("markdown", "json"), default="markdown")
    p.add_argument("--output", default="console")
    p.add_argument("--fixtures", default=None,
                   help="Comma-separated fixture subdirs")
    # Accept the JS-style --key=value form, and ignore the bare `--`
    # separator that pnpm injects when forwarding args.
    import sys
    raw: list[str] = []
    for arg in sys.argv[1:]:
        if arg == "--":
            continue
        if "=" in arg and arg.startswith("--"):
            k, v = arg.split("=", 1)
            raw.extend([k, v])
        else:
            raw.append(arg)
    ns = p.parse_args(raw)
    fixtures = ns.fixtures.split(",") if ns.fixtures else None
    return Args(
        iterations=ns.iterations,
        format=ns.format,
        output=ns.output,
        fixtures=fixtures,
    )


def get_image_pairs(subdir: str) -> list[ImagePair]:
    """Scan `<repo>/fixtures/<subdir>/` for `Na.png` + `Nb.png` pairs."""
    pairs: list[ImagePair] = []
    base = fixtures_dir() / subdir
    if not base.is_dir():
        return pairs

    pair_map: dict[str, dict[str, Path]] = {}
    for entry in sorted(base.iterdir()):
        if entry.suffix != ".png":
            continue
        m = re.match(r"^(.*)([ab])\.png$", entry.name)
        if not m:
            continue
        base_name, side = m.group(1), m.group(2)
        pair_map.setdefault(base_name, {})[side] = entry

    for name, sides in pair_map.items():
        if "a" in sides and "b" in sides:
            pairs.append(ImagePair(
                a=sides["a"],
                b=sides["b"],
                name=f"{subdir}/{name}",
            ))
    return pairs


def get_benchmark_image_pairs(fixtures: list[str] | None) -> list[ImagePair]:
    """Mirror `getBenchmarkImagePairs` from utils.ts:
    load all pixel-fixture pairs, append per-pair (a, a, name + " (identical)"),
    shuffle.
    """
    dirs = fixtures or list(ALL_PIXEL_FIXTURE_DIRS)
    pairs: list[ImagePair] = []
    for d in dirs:
        sub = get_image_pairs(d)
        random.shuffle(sub)
        pairs.extend(sub)

    identical = [
        ImagePair(a=p.a, b=p.a, name=f"{p.name} (identical)") for p in pairs
    ]
    pairs.extend(identical)
    random.shuffle(pairs)
    return pairs


@dataclass
class BenchResult:
    name: str
    throughput: float    # ops/sec
    latency_mean: float  # ms
    latency_min: float
    latency_max: float

    def to_json(self) -> dict:
        return {
            "name": self.name,
            "throughput": self.throughput,
            "latency": {
                "mean": self.latency_mean,
                "min": self.latency_min,
                "max": self.latency_max,
            },
        }


def run_bench(name: str, fn: Callable[[], None], iterations: int,
              warmup: int = 5) -> BenchResult:
    for _ in range(warmup):
        fn()

    samples_ns: list[int] = []
    for _ in range(iterations):
        t0 = time.perf_counter_ns()
        fn()
        samples_ns.append(time.perf_counter_ns() - t0)

    samples_ms = [s / 1_000_000 for s in samples_ns]
    mean_ms = sum(samples_ms) / len(samples_ms)
    return BenchResult(
        name=name,
        throughput=1000.0 / mean_ms if mean_ms > 0 else float("inf"),
        latency_mean=mean_ms,
        latency_min=min(samples_ms),
        latency_max=max(samples_ms),
    )


def report(results: list[BenchResult], header: str, fmt: str, output: str) -> None:
    results = sorted(results, key=lambda r: r.name)

    print(f"\n{header}\n")
    cols = ("Name", "Ops/sec", "Avg (ms)", "Min (ms)", "Max (ms)")
    rows = [
        (
            r.name,
            f"{r.throughput:.2f}",
            f"{r.latency_mean:.4f}",
            f"{r.latency_min:.4f}",
            f"{r.latency_max:.4f}",
        )
        for r in results
    ]
    widths = [max(len(c), *(len(row[i]) for row in rows)) for i, c in enumerate(cols)]
    sep = "| " + " | ".join("-" * w for w in widths) + " |"
    print("| " + " | ".join(c.ljust(w) for c, w in zip(cols, widths)) + " |")
    print(sep)
    for row in rows:
        print("| " + " | ".join(v.ljust(w) for v, w in zip(row, widths)) + " |")

    if fmt == "json" and output and output != "console":
        Path(output).write_text(
            json.dumps([r.to_json() for r in results], indent=2)
        )
        print(f"\nResults saved to {output}")
