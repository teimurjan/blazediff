#!/usr/bin/env python3
"""Export MILO's weights and the PyTorch reference outputs the Rust port is tested against.

Run with the upstream checkpoint (Apache-2.0, see licenses/MILO.md):

    uv run --with torch --with numpy --with pillow \
        crates/blazediff-milo/scripts/export-reference.py path/to/MILO.pth

Provenance of the committed artifacts:
    upstream  https://github.com/ugurcogalan06/MILO @ 4f5b6fc641cae1a8aeaa8c4f04296dcad388b867
    MILO.pth  sha256 a1d66a7e0ebe0f839564ad70160ffdec709708f0b9a7dd03b19c0bee90d31f79

Writes two files:

    src/weights/milo.bin      every state_dict tensor, in state_dict order, as
                              little-endian f32 with no header (the Rust side
                              asserts the byte length at compile time)
    tests/fixtures/reference.json
                              raw error and MOS for the repo fixture pairs, plus
                              full mask / error-map dumps for a few small
                              synthetic pairs that exercise odd sizes

The model below is the reference MILO_runner.py with the `.cuda()` calls
removed, so the outputs are what the authors' code prints on a CPU.
"""

import hashlib
import json
import struct
import sys
from pathlib import Path

import numpy as np
import torch
from PIL import Image

CRATE = Path(__file__).resolve().parent.parent
ROOT = CRATE.parent.parent

# Same tensors, same order, as the checkpoint's state_dict.
STATE_DICT_KEYS = [
    "mask_finder_1.netBasic.0.weight",
    "mask_finder_1.netBasic.0.bias",
    "mask_finder_1.netBasic.2.weight",
    "mask_finder_1.netBasic.2.bias",
    "mask_finder_1.netBasic.4.weight",
    "mask_finder_1.netBasic.4.bias",
    "mask_finder_1.netBasic.6.weight",
    "mask_finder_1.netBasic.6.bias",
    "mask_finder_1.netBasic.8.weight",
    "mask_finder_1.netBasic.8.bias",
    "scaler_network.model.0.weight",
    "scaler_network.model.0.bias",
    "scaler_network.model.2.weight",
    "scaler_network.model.2.bias",
    "scaler_network.model.4.weight",
    "scaler_network.model.4.bias",
]

# Fixture pairs under fixtures/. Sizes are chosen to cover every parity of
# H and W through the three halvings.
FIXTURE_PAIRS = [
    ("blazediff/1a.png", "blazediff/1b.png"),
    ("blazediff/2a.png", "blazediff/2b.png"),
    ("blazediff/3a.png", "blazediff/3b.png"),
    ("blazediff/4a.png", "blazediff/4b.png"),
    ("alpha/1a.png", "alpha/1b.png"),
    ("pixelmatch/4a.png", "pixelmatch/4b.png"),
    ("pixelmatch/7a.png", "pixelmatch/7b.png"),
]

# (height, width) of the synthetic pairs whose maps are dumped in full.
SYNTHETIC_SIZES = [(16, 16), (17, 23), (33, 40), (64, 48)]


class ScalerNetwork(torch.nn.Module):
    def __init__(self, chn_mid=32, use_sigmoid=True):
        super().__init__()
        layers = [torch.nn.Conv2d(1, chn_mid, 1, stride=1, padding=0, bias=True)]
        layers += [torch.nn.LeakyReLU(0.2, True)]
        layers += [torch.nn.Conv2d(chn_mid, chn_mid, 1, stride=1, padding=0, bias=True)]
        layers += [torch.nn.LeakyReLU(0.2, True)]
        layers += [torch.nn.Conv2d(chn_mid, 1, 1, stride=1, padding=0, bias=True)]
        if use_sigmoid:
            layers += [torch.nn.Sigmoid()]
        self.model = torch.nn.Sequential(*layers)

    def forward(self, val):
        return self.model.forward(val)


class MaskFinder(torch.nn.Module):
    def __init__(self, input_channels, num_features=64):
        super().__init__()
        self.netBasic = torch.nn.Sequential(
            torch.nn.Conv2d(input_channels, 32, kernel_size=3, stride=1, padding=1),
            torch.nn.ReLU(inplace=False),
            torch.nn.Conv2d(32, 64, kernel_size=3, stride=1, padding=1),
            torch.nn.ReLU(inplace=False),
            torch.nn.Conv2d(64, 32, kernel_size=3, stride=1, padding=1),
            torch.nn.ReLU(inplace=False),
            torch.nn.Conv2d(32, 16, kernel_size=3, stride=1, padding=1),
            torch.nn.ReLU(inplace=False),
            torch.nn.Conv2d(16, 1, kernel_size=3, stride=1, padding=1),
        )
        self.sigmoid = torch.nn.Sigmoid()

    def forward(self, inputChannels):
        return self.sigmoid(self.netBasic(inputChannels))


class MILO(torch.nn.Module):
    def __init__(self, state_dict):
        super().__init__()
        self.mask_finder_1 = MaskFinder(7)
        self.number_of_scales = 3
        self.scaler_network = ScalerNetwork()
        self.load_state_dict(state_dict, strict=True)

    def mask_generator(self, x, y):
        refScale = [x]
        distScale = [y]
        for _ in range(self.number_of_scales):
            refScale.insert(
                0,
                torch.nn.functional.avg_pool2d(
                    input=refScale[0], kernel_size=2, stride=2, count_include_pad=False
                ),
            )
            distScale.insert(
                0,
                torch.nn.functional.avg_pool2d(
                    input=distScale[0], kernel_size=2, stride=2, count_include_pad=False
                ),
            )

        mask = refScale[0].new_zeros(
            [
                refScale[0].shape[0],
                1,
                int(np.floor(refScale[0].shape[2] / 2.0)),
                int(np.floor(refScale[0].shape[3] / 2.0)),
            ]
        )

        for intLevel in range(len(refScale)):
            maskUpsampled = torch.nn.functional.interpolate(
                input=mask, scale_factor=2, mode="bilinear", align_corners=True
            )
            if maskUpsampled.shape[2] != refScale[intLevel].shape[2]:
                maskUpsampled = torch.nn.functional.pad(
                    input=maskUpsampled, pad=[0, 0, 0, 1], mode="replicate"
                )
            if maskUpsampled.shape[3] != refScale[intLevel].shape[3]:
                maskUpsampled = torch.nn.functional.pad(
                    input=maskUpsampled, pad=[0, 1, 0, 0], mode="replicate"
                )
            mask = (
                self.mask_finder_1(
                    torch.cat([refScale[intLevel], distScale[intLevel], maskUpsampled], 1)
                )
                + maskUpsampled
            )
        return mask

    def forward(self, y, x):
        mask = self.mask_generator(x, y)
        return (mask * torch.abs(x - y)).mean()

    def MOS_score(self, y, x):
        mask = self.mask_generator(x, y)
        score = (mask * torch.abs(x - y)).mean()
        return 5 * (1 - self.scaler_network(score.reshape(1, 1, 1, 1)))

    def MILO_map(self, y, x):
        masks = self.mask_generator(x, y)
        error_map = self.scaler_network(
            (masks * torch.abs(x - y)).mean([1], keepdim=True)
        ) - self.scaler_network(torch.tensor(0.0).reshape(1, 1, 1, 1))
        return error_map, masks[0]


def to_tensor(rgba: np.ndarray) -> torch.Tensor:
    """`transforms.ToTensor()` on `Image.convert("RGB")`: drop alpha, u8 / 255."""
    rgb = torch.from_numpy(np.ascontiguousarray(rgba[..., :3]))
    return rgb.permute(2, 0, 1).float().div(255).unsqueeze(0)


def load_fixture(rel: str) -> np.ndarray:
    return np.array(Image.open(ROOT / "fixtures" / rel).convert("RGBA"))


def synthetic_pair(height: int, width: int, seed: int) -> tuple[np.ndarray, np.ndarray]:
    """A smooth-ish reference and a distorted copy: noise, a blurred patch and a flat patch."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:height, 0:width].astype(np.float32)
    base = np.stack(
        [
            127 + 100 * np.sin(xx / 5.0) * np.cos(yy / 7.0),
            127 + 100 * np.cos(xx / 3.0 + yy / 11.0),
            127 + 60 * np.sin((xx + yy) / 9.0),
        ],
        axis=-1,
    )
    base = base + rng.normal(0, 25, base.shape)
    ref = np.clip(base, 0, 255).astype(np.uint8)
    dist = ref.astype(np.float32) + rng.normal(0, 12, ref.shape)
    dist[: height // 2, : width // 3] = 90
    dist = np.clip(dist, 0, 255).astype(np.uint8)
    alpha = np.full((height, width, 1), 255, dtype=np.uint8)
    return np.concatenate([ref, alpha], -1), np.concatenate([dist, alpha], -1)


@torch.no_grad()
def evaluate(model: MILO, ref: np.ndarray, dist: np.ndarray, with_maps: bool) -> dict:
    x = to_tensor(ref)
    y = to_tensor(dist)
    raw = model(y, x).item()
    mos = model.MOS_score(y, x).item()
    case = {"width": int(x.shape[3]), "height": int(x.shape[2]), "raw_error": raw, "mos": mos}
    if with_maps:
        error_map, mask = model.MILO_map(y, x)
        case["mask"] = mask.squeeze().flatten().tolist()
        case["error_map"] = error_map.squeeze().flatten().tolist()
    return case


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    pth = Path(sys.argv[1])
    state_dict = torch.load(pth, map_location="cpu")
    assert list(state_dict.keys()) == STATE_DICT_KEYS, list(state_dict.keys())

    blob = b"".join(
        struct.pack(f"<{t.numel()}f", *t.flatten().tolist()) for t in state_dict.values()
    )
    weights_out = CRATE / "src" / "weights" / "milo.bin"
    weights_out.parent.mkdir(parents=True, exist_ok=True)
    weights_out.write_bytes(blob)
    print(f"wrote {weights_out} ({len(blob)} bytes, sha256 {hashlib.sha256(blob).hexdigest()})")

    model = MILO(state_dict).eval()
    torch.set_num_threads(1)

    reference = {
        "checkpoint_sha256": hashlib.sha256(pth.read_bytes()).hexdigest(),
        "torch": torch.__version__,
        "scaler_at_zero": model.scaler_network(torch.tensor(0.0).reshape(1, 1, 1, 1)).item(),
        "fixtures": [],
        "synthetic": [],
    }
    for a, b in FIXTURE_PAIRS:
        ref, dist = load_fixture(a), load_fixture(b)
        case = evaluate(model, ref, dist, with_maps=False)
        reference["fixtures"].append({"reference": a, "distorted": b, **case})
        print(f"{a} vs {b}: raw={case['raw_error']:.8f} mos={case['mos']:.6f}")
    for seed, (height, width) in enumerate(SYNTHETIC_SIZES):
        ref, dist = synthetic_pair(height, width, seed)
        case = evaluate(model, ref, dist, with_maps=True)
        reference["synthetic"].append({"seed": seed, "reference": ref[..., :3].flatten().tolist(),
                                       "distorted": dist[..., :3].flatten().tolist(), **case})
        print(f"synthetic {height}x{width}: raw={case['raw_error']:.8f} mos={case['mos']:.6f}")

    # The smallest input the reference accepts, so the port can refuse the same ones.
    smallest = None
    for side in range(1, 33):
        ref, dist = synthetic_pair(side, side, 99)
        try:
            evaluate(model, ref, dist, with_maps=False)
            smallest = side
            break
        except Exception:  # noqa: BLE001 - torch raises RuntimeError variants
            continue
    reference["smallest_side"] = smallest
    print(f"smallest side the reference accepts: {smallest}")

    ref_out = CRATE / "tests" / "fixtures" / "reference.json"
    ref_out.write_text(json.dumps(reference, separators=(",", ":")) + "\n")
    print(f"wrote {ref_out}")


if __name__ == "__main__":
    main()
