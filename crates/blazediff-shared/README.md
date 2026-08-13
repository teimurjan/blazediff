# blazediff-shared

The primitives every BlazeDiff crate sits on: the RGBA8 `Image` buffer, YIQ color math, and
decode/encode for **PNG, JPEG and QOI**.

## Why it exists

The crates above it form a chain — `blazediff` depends on `blazediff-ssim`, which depends on
`blazediff-interpret` — so anything two of them share has to live below all of them. Two things
qualify:

- **Image I/O.** Everyone needs to turn a path or an encoded buffer into pixels, and nobody wants
  to be a codec. Keeping it here also means one copy of the format dispatch; it used to be pasted
  into the CLI, the N-API binding and the Python extension separately, which is exactly the kind
  of thing that drifts.
- **YIQ color math.** Both the pixel diff and the region classifier measure perceptual distance
  between two pixels, and they now live in different crates.

## Usage

```rust
use blazediff_shared::{load_image_pair, save_image, Image, ImageFormat};

let (a, b) = load_image_pair("expected.png", "actual.jpg")?;
println!("{}x{}", a.width, a.height);

// `Image` is RGBA8, 4 bytes per pixel, row-major.
let out = Image::new(a.width, a.height);
save_image(&out, "diff.png", /* compression */ 0, /* quality */ 90)?;
# Ok::<(), blazediff_shared::ImageError>(())
```

Format is taken from the file extension for paths and from the magic bytes for buffers:

```rust
use blazediff_shared::{decode_image, ImageFormat};

assert_eq!(ImageFormat::from_path("a.JPEG"), Some(ImageFormat::Jpeg));
assert_eq!(ImageFormat::from_bytes(b"qoif...."), Some(ImageFormat::Qoi));

let image = decode_image(&encoded_bytes)?;
# Ok::<(), blazediff_shared::ImageError>(())
```

## API

| Item | Purpose |
| --- | --- |
| `Image` | RGBA8 buffer plus dimensions, with `as_u32` / `get_pixel` / `set_pixel` helpers |
| `ImageError` | `Io`, `Png`, `Jpeg`, `Qoi`, `UnsupportedFormat` |
| `ImageFormat` | `from_path`, `from_bytes`, `as_str` |
| `load_image`, `load_image_pair` | path in, format auto-detected; the pair loads in parallel |
| `decode_image`, `decode_image_pair` | encoded bytes in, format sniffed from magic bytes |
| `save_image` | format from the output extension |
| `load_png` … `save_qoi` | the per-codec entry points, when you already know the format |
| `yiq::color_delta` | squared YIQ distance between two packed pixels, the perceptual metric behind both the diff and the classifier |
| `yiq::{unpack_pixel, pack_pixel, is_opaque}` | packed-`u32` pixel helpers |

Per-codec modules (`png_io`, `jpeg_io`, `qoi_io`) are public too, for callers that want to skip
detection.

## Codecs

- **PNG** — vendored [libspng](https://github.com/randy408/libspng), compiled with its SIMD paths.
  Setting `BLAZEDIFF_PNG_ENABLED` to a truthy value (`1`/`true`/`yes`/`on`) routes decode and
  level-0 encode through the in-house [`blazediff-png`](https://crates.io/crates/blazediff-png)
  codec instead, with spng staying as a defensive fallback. The toggle lives here rather than in
  any one front-end, so everything built on this crate inherits it — the `blazediff` CLI, its
  N-API and Python bindings, and `@blazediff/ssim-native`. Read once per process; query it with
  `blazediff_shared::blazediff_png_enabled()`.
- **JPEG** — vendored [libjpeg-turbo](https://github.com/libjpeg-turbo/libjpeg-turbo) via the
  TurboJPEG API.
- **QOI** — [`qoi-rust`](https://crates.io/crates/qoi), pure Rust.

Adler-32 verification stays on for PNG decode: these entry points read arbitrary, possibly
untrusted files, so a corrupt zlib stream must error rather than hand back wrong pixels.

## Features

- **`codecs`** (default) — everything above. Requires a C toolchain and cmake.
- Without it the crate is pure Rust and compiles to `wasm32`, leaving only `Image`, `ImageError`
  and `ImageFormat`. That is what the wasm build of `blazediff` links.
- **`fuzzing`** — internal only; exposes the spng reference decoder for `blazediff-png`'s
  differential tests.

## Error messages are contract

`ImageError`'s `Display` strings are surfaced verbatim by the CLI, the N-API binding, the Python
extension and the JS wrappers, and `@blazediff/core-native` pattern-matches on them to tell a
missing file from a malformed one. Changing their wording is a breaking change.

## License

MIT
