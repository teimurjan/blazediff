// Wuffs PNG decoder wrapper implementation

#define WUFFS_IMPLEMENTATION
#define WUFFS_CONFIG__STATIC_FUNCTIONS

#define WUFFS_CONFIG__MODULES
#define WUFFS_CONFIG__MODULE__BASE
#define WUFFS_CONFIG__MODULE__ADLER32
#define WUFFS_CONFIG__MODULE__CRC32
#define WUFFS_CONFIG__MODULE__DEFLATE
#define WUFFS_CONFIG__MODULE__PNG
#define WUFFS_CONFIG__MODULE__ZLIB

#define WUFFS_CONFIG__DST_PIXEL_FORMAT__ENABLE_ALLOWLIST
#define WUFFS_CONFIG__DST_PIXEL_FORMAT__ALLOW_RGBA_NONPREMUL

#include "wuffs-v0.4.c"
#include "wuffs_png.h"

#include <stdlib.h>

int wuffs_png_decode_with_info(
    const uint8_t* src,
    size_t src_len,
    uint8_t* dst,
    size_t dst_len,
    uint32_t* out_width,
    uint32_t* out_height
) {
    wuffs_png__decoder* dec = wuffs_png__decoder__alloc();
    if (!dec) return 1;

    wuffs_png__decoder__set_quirk(dec, WUFFS_BASE__QUIRK_IGNORE_CHECKSUM, 1);

    wuffs_base__io_buffer src_buf = wuffs_base__ptr_u8__reader((uint8_t*)src, src_len, true);

    wuffs_base__image_config ic;
    wuffs_base__status status = wuffs_png__decoder__decode_image_config(dec, &ic, &src_buf);

    if (!wuffs_base__status__is_ok(&status)) {
        free(dec);
        return 2;
    }

    uint32_t w = wuffs_base__pixel_config__width(&ic.pixcfg);
    uint32_t h = wuffs_base__pixel_config__height(&ic.pixcfg);

    *out_width = w;
    *out_height = h;

    wuffs_base__pixel_config__set(
        &ic.pixcfg,
        WUFFS_BASE__PIXEL_FORMAT__RGBA_NONPREMUL,
        WUFFS_BASE__PIXEL_SUBSAMPLING__NONE,
        w, h);

    size_t required = (size_t)w * (size_t)h * 4;
    if (dst_len < required) {
        free(dec);
        return 3;
    }

    wuffs_base__pixel_buffer pb;
    status = wuffs_base__pixel_buffer__set_from_slice(
        &pb, &ic.pixcfg,
        wuffs_base__make_slice_u8(dst, dst_len));

    if (!wuffs_base__status__is_ok(&status)) {
        free(dec);
        return 4;
    }

    uint64_t workbuf_len = wuffs_png__decoder__workbuf_len(dec).max_incl;
    uint8_t* workbuf = NULL;
    if (workbuf_len > 0) {
        workbuf = (uint8_t*)malloc(workbuf_len);
        if (!workbuf) {
            free(dec);
            return 5;
        }
    }

    status = wuffs_png__decoder__decode_frame(
        dec, &pb, &src_buf,
        WUFFS_BASE__PIXEL_BLEND__SRC,
        wuffs_base__make_slice_u8(workbuf, workbuf_len),
        NULL);

    free(workbuf);
    free(dec);

    if (!wuffs_base__status__is_ok(&status)) {
        return 6;
    }

    return 0;
}

int wuffs_png_get_info(const uint8_t* src, size_t src_len, uint32_t* width, uint32_t* height) {
    wuffs_png__decoder* dec = wuffs_png__decoder__alloc();
    if (!dec) return 1;

    wuffs_png__decoder__set_quirk(dec, WUFFS_BASE__QUIRK_IGNORE_CHECKSUM, 1);

    wuffs_base__io_buffer src_buf = wuffs_base__ptr_u8__reader((uint8_t*)src, src_len, true);

    wuffs_base__image_config ic;
    wuffs_base__status status = wuffs_png__decoder__decode_image_config(dec, &ic, &src_buf);

    if (!wuffs_base__status__is_ok(&status)) {
        free(dec);
        return 2;
    }

    *width = wuffs_base__pixel_config__width(&ic.pixcfg);
    *height = wuffs_base__pixel_config__height(&ic.pixcfg);

    free(dec);
    return 0;
}
