use std::arch::wasm32::*;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct BlazeDiff {
    // Pre-allocated buffer for changed blocks
    changed_blocks: Vec<i32>,
}

#[wasm_bindgen]
impl BlazeDiff {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            changed_blocks: Vec::with_capacity(65536), // Pre-allocate for performance
        }
    }

    #[wasm_bindgen]
    pub fn diff(
        &mut self,
        img1: &[u8],
        img2: &[u8],
        output: &mut [u8],
        has_output: bool,
        width: i32,
        height: i32,
        threshold: f32,
        alpha: f32,
        aa_color_r: u8,
        aa_color_g: u8,
        aa_color_b: u8,
        diff_color_r: u8,
        diff_color_g: u8,
        diff_color_b: u8,
        diff_color_alt_r: u8,
        diff_color_alt_g: u8,
        diff_color_alt_b: u8,
        include_aa: bool,
        diff_mask: bool,
    ) -> i32 {
        let data_size = (width * height * 4) as usize;

        if img1.len() != data_size || img2.len() != data_size {
            return -1;
        }

        // Fast SIMD-based identical check
        if are_identical_simd(img1, img2) {
            if has_output && !diff_mask {
                fill_gray(img1, output, alpha);
            }
            return 0;
        }

        let block_size = calculate_block_size(width, height);
        let blocks_x = (width + block_size - 1) / block_size;
        let blocks_y = (height + block_size - 1) / block_size;

        // Clear and reuse the pre-allocated buffer
        self.changed_blocks.clear();

        // Phase 1: Find changed blocks
        for by in 0..blocks_y {
            for bx in 0..blocks_x {
                let start_x = bx * block_size;
                let start_y = by * block_size;
                let end_x = (start_x + block_size).min(width);
                let end_y = (start_y + block_size).min(height);

                let block_identical = is_block_identical_simd_with_output(
                    img1,
                    img2,
                    start_x,
                    start_y,
                    end_x,
                    end_y,
                    width,
                    has_output,
                    !diff_mask,
                    output.as_ptr() as *mut u8,
                    alpha,
                );

                if !block_identical {
                    self.changed_blocks.push(start_x);
                    self.changed_blocks.push(start_y);
                    self.changed_blocks.push(end_x);
                    self.changed_blocks.push(end_y);
                }
            }
        }

        // Early exit if no changes
        if self.changed_blocks.is_empty() {
            return 0;
        }

        // Phase 2: Process changed blocks
        let max_delta = 35215.0 * threshold * threshold;
        let mut diff_count = 0;
        let out_ptr = if has_output { output.as_ptr() as *mut u8 } else { std::ptr::null_mut() };

        for chunk in self.changed_blocks.chunks(4) {
            let start_x = chunk[0];
            let start_y = chunk[1];
            let end_x = chunk[2];
            let end_y = chunk[3];

            for y in start_y..end_y {
                let y_offset = (y * width) as usize;
                for x in start_x..end_x {
                    let pixel_index = y_offset + x as usize;
                    let pos = pixel_index * 4;

                    // Inline pixel comparison using unsafe direct memory access
                    unsafe {
                        let ptr1 = img1.as_ptr().add(pos);
                        let ptr2 = img2.as_ptr().add(pos);
                        let pixel1 = *(ptr1 as *const u32);
                        let pixel2 = *(ptr2 as *const u32);

                        if pixel1 != pixel2 {
                            let delta = color_delta(img1, img2, pos, pos);

                            if delta.abs() > max_delta {
                                let is_excluded_aa = !include_aa
                                    && (is_antialiased(img1, x, y, img2, width, height)
                                        || is_antialiased(img2, x, y, img1, width, height));

                                if has_output {
                                    if is_excluded_aa {
                                        if !diff_mask {
                                            draw_pixel_rgb(
                                                out_ptr, pos, aa_color_r, aa_color_g, aa_color_b,
                                            );
                                        }
                                    } else {
                                        if delta < 0.0 {
                                            draw_pixel_rgb(
                                                out_ptr,
                                                pos,
                                                diff_color_alt_r,
                                                diff_color_alt_g,
                                                diff_color_alt_b,
                                            );
                                        } else {
                                            draw_pixel_rgb(
                                                out_ptr,
                                                pos,
                                                diff_color_r,
                                                diff_color_g,
                                                diff_color_b,
                                            );
                                        }
                                        diff_count += 1;
                                    }
                                } else if !is_excluded_aa {
                                    diff_count += 1;
                                }
                            } else if has_output && !diff_mask {
                                draw_pixel_gray(img1, out_ptr, pos, alpha);
                            }
                        } else if has_output && !diff_mask {
                            draw_pixel_gray(img1, out_ptr, pos, alpha);
                        }
                    }
                }
            }
        }

        diff_count
    }
}

#[inline(always)]
fn are_identical_simd(img1: &[u8], img2: &[u8]) -> bool {
    let len = img1.len();
    let ptr1 = img1.as_ptr();
    let ptr2 = img2.as_ptr();

    // Process 64 bytes (4 v128 registers) at once for better cache efficiency
    let chunks_64 = len / 64;
    for i in 0..chunks_64 {
        let offset = i * 64;
        unsafe {
            let v1a = v128_load(ptr1.add(offset) as *const v128);
            let v2a = v128_load(ptr2.add(offset) as *const v128);
            let v1b = v128_load(ptr1.add(offset + 16) as *const v128);
            let v2b = v128_load(ptr2.add(offset + 16) as *const v128);
            let v1c = v128_load(ptr1.add(offset + 32) as *const v128);
            let v2c = v128_load(ptr2.add(offset + 32) as *const v128);
            let v1d = v128_load(ptr1.add(offset + 48) as *const v128);
            let v2d = v128_load(ptr2.add(offset + 48) as *const v128);

            if !u8x16_all_true(i8x16_eq(v1a, v2a)) ||
               !u8x16_all_true(i8x16_eq(v1b, v2b)) ||
               !u8x16_all_true(i8x16_eq(v1c, v2c)) ||
               !u8x16_all_true(i8x16_eq(v1d, v2d)) {
                return false;
            }
        }
    }

    // Handle remaining 16-byte chunks
    let remainder_start = chunks_64 * 64;
    let chunks_16 = (len - remainder_start) / 16;
    for i in 0..chunks_16 {
        let offset = remainder_start + i * 16;
        unsafe {
            let v1 = v128_load(ptr1.add(offset) as *const v128);
            let v2 = v128_load(ptr2.add(offset) as *const v128);
            if !u8x16_all_true(i8x16_eq(v1, v2)) {
                return false;
            }
        }
    }

    // Handle remaining bytes with 8-byte u64 comparisons
    let remainder_start = remainder_start + chunks_16 * 16;
    let remainder = &img1[remainder_start..];
    let remainder2 = &img2[remainder_start..];

    let u64_chunks = remainder.len() / 8;
    for i in 0..u64_chunks {
        let offset = i * 8;
        let val1 = u64::from_le_bytes([
            remainder[offset], remainder[offset + 1], remainder[offset + 2], remainder[offset + 3],
            remainder[offset + 4], remainder[offset + 5], remainder[offset + 6], remainder[offset + 7],
        ]);
        let val2 = u64::from_le_bytes([
            remainder2[offset], remainder2[offset + 1], remainder2[offset + 2], remainder2[offset + 3],
            remainder2[offset + 4], remainder2[offset + 5], remainder2[offset + 6], remainder2[offset + 7],
        ]);
        if val1 != val2 {
            return false;
        }
    }

    // Handle final remaining bytes
    let final_start = u64_chunks * 8;
    remainder[final_start..] == remainder2[final_start..]
}


#[inline(always)]
fn is_block_identical_simd_with_output(
    img1: &[u8],
    img2: &[u8],
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    width: i32,
    has_output: bool,
    should_draw_gray: bool,
    output: *mut u8,
    alpha: f32,
) -> bool {
    // Fast path: if we don't need to draw output, use SIMD block comparison
    if !has_output || !should_draw_gray {
        return is_block_identical_simd_fast(img1, img2, start_x, start_y, end_x, end_y, width);
    }

    // Slow path: need to draw gray pixels for identical pixels
    for y in start_y..end_y {
        let y_offset = y * width;
        for x in start_x..end_x {
            let pixel_index = (y_offset + x) as usize;
            let pos = pixel_index * 4;

            let pixel1 = read_u32(img1, pos);
            let pixel2 = read_u32(img2, pos);

            if pixel1 != pixel2 {
                return false;
            } else {
                unsafe {
                    draw_pixel_gray(img1, output, pos, alpha);
                }
            }
        }
    }
    true
}

#[inline(always)]
fn is_block_identical_simd_fast(
    img1: &[u8],
    img2: &[u8],
    start_x: i32,
    start_y: i32,
    end_x: i32,
    end_y: i32,
    width: i32,
) -> bool {
    for y in start_y..end_y {
        let row_start = (y * width + start_x) as usize;
        let row_width = (end_x - start_x) as usize;
        let mut x = 0;

        // Process 8 pixels (32 bytes) at once using SIMD
        while x + 8 <= row_width {
            let idx = (row_start + x) * 4;
            unsafe {
                let v1a = v128_load(img1.as_ptr().add(idx) as *const v128);
                let v2a = v128_load(img2.as_ptr().add(idx) as *const v128);
                let v1b = v128_load(img1.as_ptr().add(idx + 16) as *const v128);
                let v2b = v128_load(img2.as_ptr().add(idx + 16) as *const v128);

                if !u8x16_all_true(i8x16_eq(v1a, v2a)) || !u8x16_all_true(i8x16_eq(v1b, v2b)) {
                    return false;
                }
            }
            x += 8;
        }

        // Handle remaining pixels with 4-byte (u32) comparisons
        while x < row_width {
            let i = (row_start + x) * 4;
            if read_u32(img1, i) != read_u32(img2, i) {
                return false;
            }
            x += 1;
        }
    }
    true
}

#[inline(always)]
fn calculate_block_size(width: i32, height: i32) -> i32 {
    let area = (width * height) as f32;
    let scale = area.sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();
    let log2_val = raw_size.log2();
    let rounded = log2_val.round() as i32;
    1 << rounded.max(3) // minimum block size of 8 (2^3)
}

#[inline(always)]
fn read_u32(data: &[u8], offset: usize) -> u32 {
    unsafe {
        *(data.as_ptr().add(offset) as *const u32)
    }
}

#[inline(always)]
fn color_delta(img1: &[u8], img2: &[u8], k: usize, m: usize) -> f32 {
    let r1 = img1[k] as f32;
    let g1 = img1[k + 1] as f32;
    let b1 = img1[k + 2] as f32;
    let a1 = img1[k + 3] as f32;

    let r2 = img2[m] as f32;
    let g2 = img2[m + 1] as f32;
    let b2 = img2[m + 2] as f32;
    let a2 = img2[m + 3] as f32;

    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;
    let da = a1 - a2;

    if dr == 0.0 && dg == 0.0 && db == 0.0 && da == 0.0 {
        return 0.0;
    }

    if a1 < 255.0 || a2 < 255.0 {
        // blend pixels with background
        let rb = 48.0 + 159.0 * ((k % 2) as f32);
        let gb = 48.0 + 159.0 * (((k as f32 / 1.618033988749895) as usize & 1) as f32);
        let bb = 48.0 + 159.0 * (((k as f32 / 2.618033988749895) as usize & 1) as f32);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
    }

    let y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;
    let i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
    let q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

    let delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    // encode whether the pixel lightens or darkens in the sign
    if y > 0.0 {
        -delta
    } else {
        delta
    }
}

#[inline(always)]
fn is_antialiased(img1: &[u8], x: i32, y: i32, img2: &[u8], width: i32, height: i32) -> bool {
    let x0 = (x - 1).max(0);
    let y0 = (y - 1).max(0);
    let x2 = (x + 1).min(width - 1);
    let y2 = (y + 1).min(height - 1);

    let pos = ((y * width + x) * 4) as usize;
    let mut zeros = if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
        1
    } else {
        0
    };
    let mut min = 0.0f32;
    let mut max = 0.0f32;
    let mut min_x = 0;
    let mut min_y = 0;
    let mut max_x = 0;
    let mut max_y = 0;

    // Go through 8 adjacent pixels
    for adj_x in x0..=x2 {
        for adj_y in y0..=y2 {
            if adj_x == x && adj_y == y {
                continue;
            }

            // Brightness delta between the center pixel and adjacent one
            let adj_pos = ((adj_y * width + adj_x) * 4) as usize;
            let delta = color_delta(img1, img1, pos, adj_pos);

            // Count the number of equal, darker and brighter adjacent pixels
            if delta == 0.0 {
                zeros += 1;
                // If found more than 2 equal siblings, it's definitely not anti-aliasing
                if zeros > 2 {
                    return false;
                }
            } else if delta < min {
                // Remember the darkest pixel
                min = delta;
                min_x = adj_x;
                min_y = adj_y;
            } else if delta > max {
                // Remember the brightest pixel
                max = delta;
                max_x = adj_x;
                max_y = adj_y;
            }
        }
    }

    // If there are no both darker and brighter pixels among siblings, it's not anti-aliasing
    if min == 0.0 || max == 0.0 {
        return false;
    }

    // If either the darkest or the brightest pixel has 3+ equal siblings in both images
    // (definitely not anti-aliased), this pixel is anti-aliased
    (has_many_siblings(img1, min_x, min_y, width, height)
        && has_many_siblings(img2, min_x, min_y, width, height))
        || (has_many_siblings(img1, max_x, max_y, width, height)
            && has_many_siblings(img2, max_x, max_y, width, height))
}

#[inline(always)]
fn has_many_siblings(img: &[u8], x: i32, y: i32, width: i32, height: i32) -> bool {
    let pos = (y * width + x) as usize;
    let val = read_u32(img, pos * 4);

    // Start with 1 if on boundary (matching original logic)
    let mut count = if x == 0 || x == width - 1 || y == 0 || y == height - 1 {
        1
    } else {
        0
    };

    // Check all 8 neighbors with bounds checking
    // Top row
    if y > 0 {
        let top_row = pos - width as usize;
        if x > 0 && read_u32(img, (top_row - 1) * 4) == val {
            count += 1;
        }
        if read_u32(img, top_row * 4) == val {
            count += 1;
        }
        if x < width - 1 && read_u32(img, (top_row + 1) * 4) == val {
            count += 1;
        }
    }

    // Middle row (left and right)
    if x > 0 && read_u32(img, (pos - 1) * 4) == val {
        count += 1;
    }
    if x < width - 1 && read_u32(img, (pos + 1) * 4) == val {
        count += 1;
    }

    // Bottom row
    if y < height - 1 {
        let bottom_row = pos + width as usize;
        if x > 0 && read_u32(img, (bottom_row - 1) * 4) == val {
            count += 1;
        }
        if read_u32(img, bottom_row * 4) == val {
            count += 1;
        }
        if x < width - 1 && read_u32(img, (bottom_row + 1) * 4) == val {
            count += 1;
        }
    }

    count > 2
}

#[inline(always)]
unsafe fn draw_pixel_rgb(output: *mut u8, offset: usize, r: u8, g: u8, b: u8) {
    *output.add(offset) = r;
    *output.add(offset + 1) = g;
    *output.add(offset + 2) = b;
    *output.add(offset + 3) = 255;
}

#[inline(always)]
unsafe fn draw_pixel_gray(img: &[u8], output: *mut u8, offset: usize, alpha: f32) {
    let r = img[offset] as f32;
    let g = img[offset + 1] as f32;
    let b = img[offset + 2] as f32;
    let a = img[offset + 3] as f32;
    let y = rgb2y(r, g, b);
    let val = (255.0 + ((y - 255.0) * alpha * a) / 255.0) as u8;
    *output.add(offset) = val;
    *output.add(offset + 1) = val;
    *output.add(offset + 2) = val;
    *output.add(offset + 3) = 255;
}


fn fill_gray(img: &[u8], output: &mut [u8], alpha: f32) {
    for i in 0..img.len() / 4 {
        let pos = i * 4;
        let r = img[pos] as f32;
        let g = img[pos + 1] as f32;
        let b = img[pos + 2] as f32;
        let a = img[pos + 3] as f32;
        let y = rgb2y(r, g, b);
        let val = (255.0 + ((y - 255.0) * alpha * a) / 255.0) as u8;
        output[pos] = val;
        output[pos + 1] = val;
        output[pos + 2] = val;
        output[pos + 3] = 255;
    }
}

#[inline(always)]
fn rgb2y(r: f32, g: f32, b: f32) -> f32 {
    r * 0.29889531 + g * 0.58662247 + b * 0.11448223
}
