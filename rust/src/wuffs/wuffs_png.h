// Wuffs PNG decoder wrapper for Rust FFI
#ifndef WUFFS_PNG_H
#define WUFFS_PNG_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// Decode PNG and return dimensions in a single pass (preferred API)
// Buffer must be at least width * height * 4 bytes (RGBA)
// Returns 0 on success, non-zero on error
int wuffs_png_decode_with_info(
    const uint8_t* src,
    size_t src_len,
    uint8_t* dst,
    size_t dst_len,
    uint32_t* out_width,
    uint32_t* out_height
);

// Get PNG dimensions without decoding (for pre-allocation)
// Returns 0 on success, non-zero on error
int wuffs_png_get_info(const uint8_t* src, size_t src_len, uint32_t* width, uint32_t* height);

#ifdef __cplusplus
}
#endif

#endif // WUFFS_PNG_H
