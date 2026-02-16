//! FFI bindings for wuffs PNG decoder wrapper

extern "C" {
    pub fn wuffs_png_decode_with_info(
        src: *const u8,
        src_len: usize,
        dst: *mut u8,
        dst_len: usize,
        out_width: *mut u32,
        out_height: *mut u32,
    ) -> i32;

    pub fn wuffs_png_get_info(
        src: *const u8,
        src_len: usize,
        width: *mut u32,
        height: *mut u32,
    ) -> i32;
}
