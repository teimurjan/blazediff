use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;


#[derive(Serialize, Deserialize)]
#[wasm_bindgen]
pub struct BlazeDiffOptions {
    threshold: Option<f64>,
    alpha: Option<f64>,
    include_aa: Option<bool>,
    aa_color: Option<Vec<u8>>,
    diff_color: Option<Vec<u8>>,
    diff_color_alt: Option<Vec<u8>>,
    diff_mask: Option<bool>,
}

#[wasm_bindgen]
impl BlazeDiffOptions {
    #[wasm_bindgen(constructor)]
    pub fn new() -> BlazeDiffOptions {
        BlazeDiffOptions {
            threshold: None,
            alpha: None,
            include_aa: None,
            aa_color: None,
            diff_color: None,
            diff_color_alt: None,
            diff_mask: None,
        }
    }

    #[wasm_bindgen(getter)]
    pub fn threshold(&self) -> Option<f64> {
        self.threshold
    }

    #[wasm_bindgen(setter)]
    pub fn set_threshold(&mut self, value: Option<f64>) {
        self.threshold = value;
    }

    #[wasm_bindgen(getter)]
    pub fn alpha(&self) -> Option<f64> {
        self.alpha
    }

    #[wasm_bindgen(setter)]
    pub fn set_alpha(&mut self, value: Option<f64>) {
        self.alpha = value;
    }

    #[wasm_bindgen(getter)]
    pub fn include_aa(&self) -> Option<bool> {
        self.include_aa
    }

    #[wasm_bindgen(setter)]
    pub fn set_include_aa(&mut self, value: Option<bool>) {
        self.include_aa = value;
    }

    #[wasm_bindgen(getter)]
    pub fn diff_mask(&self) -> Option<bool> {
        self.diff_mask
    }

    #[wasm_bindgen(setter)]
    pub fn set_diff_mask(&mut self, value: Option<bool>) {
        self.diff_mask = value;
    }
}

impl Default for BlazeDiffOptions {
    fn default() -> Self {
        Self::new()
    }
}

/// Unified high-performance SIMD-optimized image comparison
/// Uses zero-copy access to image data for maximum performance
/// Returns a JavaScript object with { diff: number, output?: Uint8Array }
#[wasm_bindgen]
pub fn blazediff(
    image1: &[u8],
    image2: &[u8],
    width: u32,
    height: u32,
    options: Option<BlazeDiffOptions>,
    output_needed: bool,
) -> js_sys::Object {
    let (diff_count, output) =
        blazediff_internal(image1, image2, output_needed, width, height, options);

    let result = js_sys::Object::new();
    js_sys::Reflect::set(&result, &"diff".into(), &(diff_count as f64).into()).unwrap();

    if output_needed {
        let output_buffer = output.unwrap_or_else(|| vec![0; (width * height * 4) as usize]);
        js_sys::Reflect::set(
            &result,
            &"output".into(),
            &js_sys::Uint8Array::from(&output_buffer[..]).into(),
        )
        .unwrap();
    }

    result
}

fn blazediff_internal(
    image1: &[u8],
    image2: &[u8],
    create_output: bool,
    width: u32,
    height: u32,
    options: Option<BlazeDiffOptions>,
) -> (u32, Option<Vec<u8>>) {
    let opts = options.unwrap_or_default();
    let threshold = opts.threshold.unwrap_or(0.1);
    let alpha = opts.alpha.unwrap_or(0.1);
    let aa_color = opts.aa_color.unwrap_or_else(|| vec![255, 255, 0]);
    let diff_color = opts.diff_color.unwrap_or_else(|| vec![255, 0, 0]);
    let diff_color_alt = opts.diff_color_alt.as_ref().unwrap_or(&diff_color);
    let include_aa = opts.include_aa.unwrap_or(false);
    let diff_mask = opts.diff_mask.unwrap_or(false);

    let expected_size = (width * height * 4) as usize;
    assert_eq!(image1.len(), expected_size, "Image1 size mismatch");
    assert_eq!(image2.len(), expected_size, "Image2 size mismatch");

    let mut output_buffer = if create_output || !diff_mask {
        let mut buf = vec![0u8; expected_size];
        if !diff_mask {
            unsafe {
                simd_draw_grayscale_background(&image1, alpha, &mut buf);
            }
        }
        Some(buf)
    } else {
        None
    };

    let block_size = calculate_optimal_block_size(width, height);
    let blocks_x = (width + block_size - 1) / block_size;
    let blocks_y = (height + block_size - 1) / block_size;

    let mut changed_blocks =
        Vec::<(u32, u32, u32, u32)>::with_capacity((blocks_x * blocks_y) as usize);

    for by in 0..blocks_y {
        for bx in 0..blocks_x {
            let sx = bx * block_size;
            let sy = by * block_size;
            let ex = (sx + block_size).min(width);
            let ey = (sy + block_size).min(height);
            let identical = unsafe { simd_compare_block(image1, image2, sx, sy, ex, ey, width) };
            if !identical {
                changed_blocks.push((sx, sy, ex, ey));
            }
        }
    }

    if changed_blocks.is_empty() {
        return (0, output_buffer);
    }

    let max_delta = 35215.0 * threshold * threshold;
    // A conservative, cheap screen; tune as needed:
    let pre_thresh = ((threshold * 255.0) as u8).saturating_sub(1);

    let mut diff = 0u32;
    let height = (image1.len() / 4 / width as usize) as u32; // Calculate once, reuse everywhere
    
    for &(sx, sy, ex, ey) in &changed_blocks {
        for y in sy..ey {
            let row = (y * width) as usize;
            let mut x = sx;
            
            // Process in SIMD batches of 8 pixels when possible
            while x + 8 <= ex {
                let processed = unsafe {
                    simd_process_pixel_batch_8(
                        image1, image2, &mut output_buffer, 
                        row, x, width, height, max_delta, pre_thresh,
                        include_aa, &aa_color, &diff_color, diff_color_alt, diff_mask
                    )
                };
                diff += processed;
                x += 8;
            }
            
            // Process remaining 4-pixel batches
            while x + 4 <= ex {
                let processed = unsafe {
                    simd_process_pixel_batch(
                        image1, image2, &mut output_buffer, 
                        row, x, width, height, max_delta, pre_thresh,
                        include_aa, &aa_color, &diff_color, diff_color_alt, diff_mask
                    )
                };
                diff += processed;
                x += 4;
            }
            
            // Process remaining pixels with optimized single-pixel function
            while x < ex {
                let processed = unsafe {
                    simd_process_single_pixel(
                        image1, image2, &mut output_buffer,
                        row, x, width, height, max_delta, pre_thresh,
                        include_aa, &aa_color, &diff_color, diff_color_alt, diff_mask
                    )
                };
                diff += processed;
                x += 1;
            }
        }
    }

    (diff, output_buffer)
}

#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_process_pixel_batch(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    start_x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    use std::arch::wasm32::{ v128, v128_load, v128_any_true, i32x4_ne };
    
    // Load 4 consecutive pixels (16 bytes each image)
    let base_idx = (row + start_x as usize) * 4;
    let pixels1_ptr = image1.as_ptr().add(base_idx);
    let pixels2_ptr = image2.as_ptr().add(base_idx);
    let pixels1 = v128_load(pixels1_ptr as *const v128);
    let pixels2 = v128_load(pixels2_ptr as *const v128);
    
    // Early-out if all 4 pixels are equal using i32x4 compare
    if !v128_any_true(i32x4_ne(pixels1, pixels2)) {
        return 0;
    }
    
    // Extract bytes for scalar max computation (SIMD extract is complex for this use case)
    let bytes1 = std::mem::transmute::<v128, [u8; 16]>(pixels1);
    let bytes2 = std::mem::transmute::<v128, [u8; 16]>(pixels2);
    
    // Compute max(|Δr|,|Δg|,|Δb|) for each pixel and check against pre_thresh
    let mut needs_processing = 0u8;
    
    // Pixel 0 (bytes 0-3)
    let p0_dr = bytes1[0].abs_diff(bytes2[0]);
    let p0_dg = bytes1[1].abs_diff(bytes2[1]);
    let p0_db = bytes1[2].abs_diff(bytes2[2]);
    if p0_dr.max(p0_dg).max(p0_db) >= pre_thresh {
        needs_processing |= 1;
    }
    
    // Pixel 1 (bytes 4-7)
    let p1_dr = bytes1[4].abs_diff(bytes2[4]);
    let p1_dg = bytes1[5].abs_diff(bytes2[5]);
    let p1_db = bytes1[6].abs_diff(bytes2[6]);
    if p1_dr.max(p1_dg).max(p1_db) >= pre_thresh {
        needs_processing |= 2;
    }
    
    // Pixel 2 (bytes 8-11)
    let p2_dr = bytes1[8].abs_diff(bytes2[8]);
    let p2_dg = bytes1[9].abs_diff(bytes2[9]);
    let p2_db = bytes1[10].abs_diff(bytes2[10]);
    if p2_dr.max(p2_dg).max(p2_db) >= pre_thresh {
        needs_processing |= 4;
    }
    
    // Pixel 3 (bytes 12-15)
    let p3_dr = bytes1[12].abs_diff(bytes2[12]);
    let p3_dg = bytes1[13].abs_diff(bytes2[13]);
    let p3_db = bytes1[14].abs_diff(bytes2[14]);
    if p3_dr.max(p3_dg).max(p3_db) >= pre_thresh {
        needs_processing |= 8;
    }
    
    // Early exit if no pixels need processing
    if needs_processing == 0 {
        return 0;
    }
    
    let mut diffs = 0u32;
    
    // Process only pixels with set bits in the mask
    for i in 0..4 {
        if (needs_processing & (1 << i)) == 0 {
            continue;
        }
        
        let pixel_x = start_x + i;
        let idx = (row + pixel_x as usize) * 4;
        
        // Use raw pointer reads for per-pixel data
        let p1_ptr = pixels1_ptr.add(i as usize * 4);
        let p2_ptr = pixels2_ptr.add(i as usize * 4);
        let p1 = *(p1_ptr as *const u32);
        let p2 = *(p2_ptr as *const u32);
        
        if p1 == p2 {
            continue;
        }

        // Calculate scalar color_delta for precise numerics
        let p1_bytes = std::slice::from_raw_parts(p1_ptr, 4);
        let p2_bytes = std::slice::from_raw_parts(p2_ptr, 4);
        let delta = color_delta(p1_bytes, p2_bytes, idx, false);
        
        if delta.abs() > max_delta {
            let pixel_y = (row / width as usize) as u32;
            let is_aa = !include_aa
                && (simd_antialiased(image1, image2, pixel_x, pixel_y, width, height)
                    || simd_antialiased(image2, image1, pixel_x, pixel_y, width, height));

            if is_aa {
                if let Some(ref mut out) = output_buffer {
                    if !diff_mask {
                        draw_pixel(&mut out[idx..idx + 4], aa_color);
                    }
                }
            } else {
                if let Some(ref mut out) = output_buffer {
                    let col = if delta < 0.0 {
                        diff_color_alt
                    } else {
                        diff_color
                    };
                    draw_pixel(&mut out[idx..idx + 4], col);
                }
                diffs += 1;
            }
        }
    }
    
    diffs
}

// Enhanced SIMD processing for 8 pixels (2x v128 registers) 
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_process_pixel_batch_8(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    start_x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    use std::arch::wasm32::{v128, v128_load, v128_any_true, i32x4_ne};
    
    // Load 8 consecutive pixels (32 bytes total = 2x v128 loads)
    let base_idx = (row + start_x as usize) * 4;
    let pixels1_ptr = image1.as_ptr().add(base_idx);
    let pixels2_ptr = image2.as_ptr().add(base_idx);
    
    // Load first 4 pixels (bytes 0-15)
    let pixels1_lo = v128_load(pixels1_ptr as *const v128);
    let pixels2_lo = v128_load(pixels2_ptr as *const v128);
    
    // Load next 4 pixels (bytes 16-31)  
    let pixels1_hi = v128_load(pixels1_ptr.add(16) as *const v128);
    let pixels2_hi = v128_load(pixels2_ptr.add(16) as *const v128);
    
    // Early-out if all 8 pixels are equal using dual i32x4 compare
    let cmp_lo = i32x4_ne(pixels1_lo, pixels2_lo);
    let cmp_hi = i32x4_ne(pixels1_hi, pixels2_hi);
    if !v128_any_true(cmp_lo) && !v128_any_true(cmp_hi) {
        return 0;
    }
    
    // Build prefilter mask using bytes extracted from SIMD registers
    let a_lo = std::mem::transmute::<v128, [u8; 16]>(pixels1_lo);
    let b_lo = std::mem::transmute::<v128, [u8; 16]>(pixels2_lo);
    let a_hi = std::mem::transmute::<v128, [u8; 16]>(pixels1_hi);
    let b_hi = std::mem::transmute::<v128, [u8; 16]>(pixels2_hi);

    let mut needs: u8 = 0;
    // pixels 0..3 (lo)
    for p in 0..4 {
        let base = p * 4;
        let dr = a_lo[base].abs_diff(b_lo[base]);
        let dg = a_lo[base+1].abs_diff(b_lo[base+1]);
        let db = a_lo[base+2].abs_diff(b_lo[base+2]);
        if dr.max(dg).max(db) >= pre_thresh { needs |= 1 << p; }
    }
    // pixels 4..7 (hi)
    for p in 0..4 {
        let base = p * 4;
        let dr = a_hi[base].abs_diff(b_hi[base]);
        let dg = a_hi[base+1].abs_diff(b_hi[base+1]);
        let db = a_hi[base+2].abs_diff(b_hi[base+2]);
        if dr.max(dg).max(db) >= pre_thresh { needs |= 1 << (p+4); }
    }
    if needs == 0 { return 0; }

    let mut diffs = 0u32;
    for i in 0..8 {
        if (needs & (1 << i)) == 0 { continue; }
        let pixel_x = start_x + i;
        let idx = (row + pixel_x as usize) * 4;
        let p_ptr = pixels1_ptr.add(i as usize * 4);
        let q_ptr = pixels2_ptr.add(i as usize * 4);
        let p1 = *(p_ptr as *const u32);
        let p2 = *(q_ptr as *const u32);
        if p1 == p2 { continue; }
        let p1_bytes = std::slice::from_raw_parts(p_ptr, 4);
        let p2_bytes = std::slice::from_raw_parts(q_ptr, 4);
        let delta = color_delta(p1_bytes, p2_bytes, idx, false);
        if delta.abs() > max_delta {
            let pixel_y = (row / width as usize) as u32;
            let is_aa = !include_aa && (simd_antialiased(image1, image2, pixel_x, pixel_y, width, height)
                || simd_antialiased(image2, image1, pixel_x, pixel_y, width, height));
            if is_aa { if let Some(ref mut out) = output_buffer { if !diff_mask { draw_pixel(&mut out[idx..idx+4], aa_color); } } }
            else { if let Some(ref mut out) = output_buffer { let col = if delta < 0.0 { diff_color_alt } else { diff_color }; draw_pixel(&mut out[idx..idx+4], col); } diffs += 1; }
        }
    }
    diffs
}

// Non-WASM fallback for 8-pixel processing
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_process_pixel_batch_8(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    start_x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    // Fallback: process 8 pixels individually
    let mut diffs = 0u32;
    for i in 0..8 {
        diffs += simd_process_single_pixel(
            image1, image2, output_buffer,
            row, start_x + i, width, height,
            max_delta, pre_thresh, include_aa, aa_color, diff_color, diff_color_alt, diff_mask
        );
    }
    diffs
}

// Optimized single-pixel processing using same pointer-based approach as SIMD batch
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_process_single_pixel(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    let idx = (row + x as usize) * 4;
    
    // Use raw pointer reads for consistency
    let p1_ptr = image1.as_ptr().add(idx);
    let p2_ptr = image2.as_ptr().add(idx);
    let p1 = *(p1_ptr as *const u32);
    let p2 = *(p2_ptr as *const u32);
        
        if p1 == p2 {
        return 0;
    }
    
    // Fast delta screening using raw pointer data
    let p1_bytes = std::slice::from_raw_parts(p1_ptr, 4);
    let p2_bytes = std::slice::from_raw_parts(p2_ptr, 4);
    
    if !fast_delta_pass(p1_bytes, p2_bytes, pre_thresh) {
        return 0;
    }
    
    // Calculate scalar color_delta for precise numerics
    let delta = color_delta(p1_bytes, p2_bytes, idx, false);
        
        if delta.abs() > max_delta {
            let pixel_y = (row / width as usize) as u32;
            let is_aa = !include_aa
            && (simd_antialiased(image1, image2, x, pixel_y, width, height)
                || simd_antialiased(image2, image1, x, pixel_y, width, height));

            if is_aa {
                if let Some(ref mut out) = output_buffer {
                    if !diff_mask {
                        draw_pixel(&mut out[idx..idx + 4], aa_color);
                    }
                }
            } else {
                if let Some(ref mut out) = output_buffer {
                    let col = if delta < 0.0 {
                        diff_color_alt
                    } else {
                        diff_color
                    };
                    draw_pixel(&mut out[idx..idx + 4], col);
                }
            return 1;
        }
    }
    
    0
}

// Non-WASM fallback for single pixel processing
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_process_single_pixel(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    let idx = (row + x as usize) * 4;
        
        let p1 = *(image1.as_ptr().add(idx) as *const u32);
        let p2 = *(image2.as_ptr().add(idx) as *const u32);
        
        if p1 == p2 {
        return 0;
        }

        if !fast_delta_pass(&image1[idx..idx + 4], &image2[idx..idx + 4], pre_thresh) {
        return 0;
        }

        let delta = color_delta(&image1[idx..idx + 4], &image2[idx..idx + 4], idx, false);
        
        if delta.abs() > max_delta {
            let pixel_y = (row / width as usize) as u32;
            let is_aa = !include_aa
            && (simd_antialiased(image1, image2, x, pixel_y, width, height)
                || simd_antialiased(image2, image1, x, pixel_y, width, height));

            if is_aa {
                if let Some(ref mut out) = output_buffer {
                    if !diff_mask {
                        draw_pixel(&mut out[idx..idx + 4], aa_color);
                    }
                }
            } else {
                if let Some(ref mut out) = output_buffer {
                    let col = if delta < 0.0 {
                        diff_color_alt
                    } else {
                        diff_color
                    };
                    draw_pixel(&mut out[idx..idx + 4], col);
                }
            return 1;
        }
    }
    
    0
}

// SIMD helper function for pointer-based antialiasing check
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_antialiased(image1: &[u8], image2: &[u8], x1: u32, y1: u32, width: u32, height: u32) -> bool {
    simd_antialiased_with_pointers(image1.as_ptr(), image2.as_ptr(), x1, y1, width, height, image1.len())
}

// Non-WASM fallbacks for AA helpers (pointer-based variants)
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_antialiased(image1: &[u8], image2: &[u8], x1: u32, y1: u32, width: u32, height: u32) -> bool {
    simd_antialiased_with_pointers(image1.as_ptr(), image2.as_ptr(), x1, y1, width, height, image1.len())
}

#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_antialiased_with_pointers(
    image1_ptr: *const u8,
    image2_ptr: *const u8,
    x1: u32,
    y1: u32,
    width: u32,
    height: u32,
    _img_len: usize,
) -> bool {
    // Reconstruct slices (length derived from width*height*4)
    let total = (width as usize) * (height as usize) * 4;
    let image1 = std::slice::from_raw_parts(image1_ptr, total);
    let image2 = std::slice::from_raw_parts(image2_ptr, total);

    // Scalar AA identical to our wasm pointer version but without SIMD intrinsics
    #[inline(always)]
    unsafe fn scalar_luma_delta(center: *const u8, adj: *const u8, k: usize) -> f32 {
        let c = *(center as *const u32);
        let a = *(adj as *const u32);
        if c == a { return 0.0; }
        let cb = c.to_le_bytes();
        let ab = a.to_le_bytes();
        let (r1,g1,b1,a1) = (cb[0] as f32, cb[1] as f32, cb[2] as f32, cb[3] as f32);
        let (r2,g2,b2,a2) = (ab[0] as f32, ab[1] as f32, ab[2] as f32, ab[3] as f32);
    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;
        if !(a1 == 255.0 && a2 == 255.0) {
    let da = a1 - a2;
            let k_mod = k & 0xFFFF;
        let rb = 48.0 + 159.0 * ((k_mod & 1) as f32);
        let gb = 48.0 + 159.0 * ((((k_mod as f32 * 0.618_033_99) as usize) & 1) as f32);
        let bb = 48.0 + 159.0 * ((((k_mod as f32 * 0.381_966_01) as usize) & 1) as f32);
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
    }
        dr * 0.298_895_31 + dg * 0.586_622_47 + db * 0.114_482_23
    }

    let w = width as usize;
    let pixel_pos = y1 as usize * w + x1 as usize;
    let pos = pixel_pos * 4;
    let center_ptr = image1.as_ptr().add(pos);

    let x0 = if x1 > 0 { x1 - 1 } else { 0 };
    let y0 = if y1 > 0 { y1 - 1 } else { 0 };
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);

    let mut zeroes = if x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2 { 1 } else { 0 };
    let mut min = 0.0f32;
    let mut max = 0.0f32;
    let mut min_x = x1; let mut min_y = y1;
    let mut max_x = x1; let mut max_y = y1;

    for y in y0..=y2 {
        let row_base = y as usize * w;
        for x in x0..=x2 {
            if x == x1 && y == y1 { continue; }
            let adj_idx = (row_base + x as usize) * 4;
            let adj_ptr = image1.as_ptr().add(adj_idx);
            let delta = scalar_luma_delta(center_ptr, adj_ptr, pos);
            if delta == 0.0 {
                zeroes += 1; if zeroes > 2 { return false; }
            } else if delta < min { min = delta; min_x = x; min_y = y; }
            else if delta > max { max = delta; max_x = x; max_y = y; }
        }
    }
    if min == 0.0 || max == 0.0 { return false; }

    // has_many_siblings scalar helper
    #[inline(always)]
    unsafe fn has_many_siblings(image: &[u8], x1: u32, y1: u32, width: u32, height: u32) -> bool {
        let w = width as usize;
        let center_idx = y1 as usize * w + x1 as usize;
        let img_u32 = std::slice::from_raw_parts(image.as_ptr() as *const u32, w * height as usize);
        let target = *img_u32.get_unchecked(center_idx);
        let mut count = if x1 == 0 || x1 == width - 1 || y1 == 0 || y1 == height - 1 { 1 } else { 0 };
        let x0 = if x1 > 0 { x1 - 1 } else { 0 } as usize;
        let y0 = if y1 > 0 { y1 - 1 } else { 0 } as usize;
        let x2 = ((x1 + 1).min(width - 1)) as usize;
        let y2 = ((y1 + 1).min(height - 1)) as usize;
        let cx = x1 as usize; let cy = y1 as usize;
        for y in y0..=y2 { let row = y * w; for x in x0..=x2 {
            if x != cx || y != cy { if *img_u32.get_unchecked(row + x) == target { count += 1; if count > 2 { return true; } } }
        }}
        false
    }

    (has_many_siblings(image1, min_x, min_y, width, height) && has_many_siblings(image2, min_x, min_y, width, height))
        || (has_many_siblings(image1, max_x, max_y, width, height) && has_many_siblings(image2, max_x, max_y, width, height))
}

#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_antialiased_with_pointers(
    image1_ptr: *const u8,
    image2_ptr: *const u8, 
    x1: u32, 
    y1: u32, 
    width: u32, 
    height: u32,
    img_len: usize
) -> bool {

    let w = width as usize;
    let pixel_pos = y1 as usize * w + x1 as usize;
    let pos = pixel_pos * 4;
    let center_ptr = image1_ptr.add(pos);

    // Early boundary check for edge cases
    let x0 = if x1 > 0 { x1 - 1 } else { 0 };
    let y0 = if y1 > 0 { y1 - 1 } else { 0 };
    let x2 = (x1 + 1).min(width - 1);
    let y2 = (y1 + 1).min(height - 1);

    let mut zeroes = if x1 == x0 || x1 == x2 || y1 == y0 || y1 == y2 {
        1
    } else {
        0
    };

    let mut min = 0.0f32;
    let mut max = 0.0f32;
    let mut min_x = x1;
    let mut min_y = y1;
    let mut max_x = x1;
    let mut max_y = y1;

    // Load center pixel for SIMD equality comparisons
    let center_pixel = *(center_ptr as *const u32);
    
    // Process neighbors with SIMD equality checks but scalar Y-delta
    for y in y0..=y2 {
        let row_base = y as usize * w;
        for x in x0..=x2 {
            if x == x1 && y == y1 {
                continue; // Skip center
            }

            let adj_idx = (row_base + x as usize) * 4;
            if adj_idx + 4 > img_len {
                continue;
            }

            let adj_ptr = image1_ptr.add(adj_idx);
            let adj_pixel = *(adj_ptr as *const u32);

            // SIMD equality check for neighbors
            if adj_pixel == center_pixel {
                zeroes += 1;
                if zeroes > 2 {
                    return false; // Early exit
                }
            } else {
                // Scalar luminance delta calculation (keep precise)
                let delta = simd_fast_luma_delta(center_ptr, adj_ptr, pos);
                
                if delta < min {
                min = delta;
                min_x = x;
                min_y = y;
            } else if delta > max {
                max = delta;
                max_x = x;
                max_y = y;
                }
            }
        }
    }

    if min == 0.0 || max == 0.0 {
        return false;
    }

    // Use optimized has_many_siblings with pointers
    (simd_has_many_siblings_with_pointers(image1_ptr, min_x, min_y, width, height, img_len)
        && simd_has_many_siblings_with_pointers(image2_ptr, min_x, min_y, width, height, img_len))
        || (simd_has_many_siblings_with_pointers(image1_ptr, max_x, max_y, width, height, img_len)
            && simd_has_many_siblings_with_pointers(image2_ptr, max_x, max_y, width, height, img_len))
}

// Fast SIMD-optimized luminance delta for antialiasing
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_fast_luma_delta(center: *const u8, adj: *const u8, k: usize) -> f32 {
    // Load pixels as u32 for fast comparison first
    let center_u32 = *(center as *const u32);
    let adj_u32 = *(adj as *const u32);

    if center_u32 == adj_u32 {
        return 0.0;
    }

    // Extract RGBA components efficiently (little-endian byte order)
    let center_rgba = center_u32.to_le_bytes();
    let adj_rgba = adj_u32.to_le_bytes();

    let r1 = center_rgba[0] as f32;
    let g1 = center_rgba[1] as f32;
    let b1 = center_rgba[2] as f32;
    let a1 = center_rgba[3] as f32;

    let r2 = adj_rgba[0] as f32;
    let g2 = adj_rgba[1] as f32;
    let b2 = adj_rgba[2] as f32;
    let a2 = adj_rgba[3] as f32;

    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;

    // Fast path for opaque pixels (most common case)
    if a1 == 255.0 && a2 == 255.0 {
        return dr * 0.298_895_31 + dg * 0.586_622_47 + db * 0.114_482_23;
    }

    // Alpha blending path (optimized)
    let da = a1 - a2;
    let k_mod = k & 0xFFFF; // Limit k to prevent overflow
    let rb = 48.0 + 159.0 * ((k_mod & 1) as f32);
    let gb = 48.0 + 159.0 * ((((k_mod as f32 * 0.618_033_99) as usize) & 1) as f32);
    let bb = 48.0 + 159.0 * ((((k_mod as f32 * 0.381_966_01) as usize) & 1) as f32);

    dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
    dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
    db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;

    dr * 0.298_895_31 + dg * 0.586_622_47 + db * 0.114_482_23
}

// Optimized has_many_siblings with pointers
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_has_many_siblings_with_pointers(
    image_ptr: *const u8,
    x1: u32,
    y1: u32,
    width: u32,
    height: u32,
    img_len: usize
) -> bool {
    
    let w = width as usize;
    let center_idx = y1 as usize * w + x1 as usize;
    let center_byte_idx = center_idx * 4;
    
    if center_byte_idx + 4 > img_len {
        return false;
    }
    
    let target_pixel = *(image_ptr.add(center_byte_idx) as *const u32);

    // Edge bias (same as original)
    let mut count = if x1 == 0 || x1 == width - 1 || y1 == 0 || y1 == height - 1 {
        1
    } else {
        0
    };

    let x0 = if x1 > 0 { x1 - 1 } else { 0 } as usize;
    let y0 = if y1 > 0 { y1 - 1 } else { 0 } as usize;
    let x2 = ((x1 + 1).min(width - 1)) as usize;
    let y2 = ((y1 + 1).min(height - 1)) as usize;

    let center_x = x1 as usize;
    let center_y = y1 as usize;

    // Optimized 3x3 neighbor check with early exit and SIMD equality
    for y in y0..=y2 {
        let row_base = y * w;
        for x in x0..=x2 {
            if x != center_x || y != center_y {
                let pixel_idx = row_base + x;
                let byte_idx = pixel_idx * 4;
                
                if byte_idx + 4 <= img_len {
                    let neighbor_pixel = *(image_ptr.add(byte_idx) as *const u32);
                    if neighbor_pixel == target_pixel {
                    count += 1;
                    if count > 2 {
                            return true; // Early exit when condition is met
                        }
                    }
                }
            }
        }
    }

    false
}

// Non-WASM fallback implementations
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_antialiased(image1: &[u8], image2: &[u8], x1: u32, y1: u32, width: u32, height: u32) -> bool {
    // Fallback to the WASM optimized version 
    simd_antialiased_with_pointers(image1.as_ptr(), image2.as_ptr(), x1, y1, width, height, image1.len())
}

// Fallback for non-WASM targets
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_process_pixel_batch(
    image1: &[u8],
    image2: &[u8], 
    output_buffer: &mut Option<Vec<u8>>,
    row: usize,
    start_x: u32,
    width: u32,
    height: u32,
    max_delta: f64,
    pre_thresh: u8,
    include_aa: bool,
    aa_color: &[u8],
    diff_color: &[u8],
    diff_color_alt: &[u8],
    diff_mask: bool,
) -> u32 {
    // Fallback to scalar processing for non-WASM
    let mut diffs = 0u32;
    
    for i in 0..4 {
        let pixel_x = start_x + i;
        let idx = (row + pixel_x as usize) * 4;
        
        let p1 = *(image1.as_ptr().add(idx) as *const u32);
        let p2 = *(image2.as_ptr().add(idx) as *const u32);
        
        if p1 == p2 {
            continue;
        }

        if !fast_delta_pass(&image1[idx..idx + 4], &image2[idx..idx + 4], pre_thresh) {
            continue;
        }

        let delta = color_delta(&image1[idx..idx + 4], &image2[idx..idx + 4], idx, false);
        
        if delta.abs() > max_delta {
            let pixel_y = (row / width as usize) as u32;
            let is_aa = !include_aa
                && (simd_antialiased(image1, image2, pixel_x, pixel_y, width, height)
                    || simd_antialiased(image2, image1, pixel_x, pixel_y, width, height));

            if is_aa {
                if let Some(ref mut out) = output_buffer {
                    if !diff_mask {
                        draw_pixel(&mut out[idx..idx + 4], aa_color);
                    }
                }
            } else {
                if let Some(ref mut out) = output_buffer {
                    let col = if delta < 0.0 {
                        diff_color_alt
                    } else {
                        diff_color
                    };
                    draw_pixel(&mut out[idx..idx + 4], col);
                }
                diffs += 1;
            }
        }
    }
    
    diffs
}

fn calculate_optimal_block_size(width: u32, height: u32) -> u32 {
    let area = width * height;
    let scale = (area as f64).sqrt() / 100.0;
    let raw_size = 16.0 * scale.sqrt();

    // More efficient power-of-2 rounding using bit operations
    let log2_val = raw_size.log2();
    1 << (log2_val.round() as u32).max(3).min(8) // Clamp between 8 and 256
}

fn color_delta(pixel1: &[u8], pixel2: &[u8], k: usize, y_only: bool) -> f64 {
    // Early exit for identical pixels
    if pixel1[0] == pixel2[0]
        && pixel1[1] == pixel2[1]
        && pixel1[2] == pixel2[2]
        && pixel1[3] == pixel2[3]
    {
        return 0.0;
    }

    let r1 = pixel1[0] as f64;
    let g1 = pixel1[1] as f64;
    let b1 = pixel1[2] as f64;
    let a1 = pixel1[3] as f64;
    let r2 = pixel2[0] as f64;
    let g2 = pixel2[1] as f64;
    let b2 = pixel2[2] as f64;
    let a2 = pixel2[3] as f64;

    let mut dr = r1 - r2;
    let mut dg = g1 - g2;
    let mut db = b1 - b2;
    let da = a1 - a2;

    if a1 < 255.0 || a2 < 255.0 {
        // Blend pixels with background (same formula as JavaScript)
        let rb = 48.0 + 159.0 * (k & 1) as f64;
        let gb = 48.0 + 159.0 * (((k as f64 * 0.6180339887) as usize) & 1) as f64;
        let bb = 48.0 + 159.0 * (((k as f64 * 0.3819660113) as usize) & 1) as f64;
        dr = (r1 * a1 - r2 * a2 - rb * da) / 255.0;
        dg = (g1 * a1 - g2 * a2 - gb * da) / 255.0;
        db = (b1 * a1 - b2 * a2 - bb * da) / 255.0;
    }

    let y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

    if y_only {
        return y;
    }

    let i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
    let q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

    let delta = 0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q;

    if y > 0.0 {
        -delta
    } else {
        delta
    }
}



fn draw_pixel(output: &mut [u8], color: &[u8]) {
    output[0] = color[0];
    output[1] = color[1];
    output[2] = color[2];
    output[3] = 255;
}

// SIMD-optimized grayscale background drawing
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_draw_grayscale_background(input: &[u8], alpha: f64, output: &mut [u8]) {
    use std::arch::wasm32::*;
    
    let len = input.len();
    let mut i = 0;
    
    // Process 4 pixels at a time (16 bytes) using SIMD
    while i + 16 <= len {
        // Load 4 RGBA pixels
        let _pixels = v128_load(input.as_ptr().add(i) as *const v128);
        
        // Process each pixel individually for now (complex luminance calculation)
        // In future could be optimized with SIMD arithmetic
        for j in 0..4 {
            let pixel_offset = i + j * 4;
            draw_gray_pixel(&input[pixel_offset..pixel_offset + 4], alpha, &mut output[pixel_offset..pixel_offset + 4]);
        }
        
        i += 16;
    }
    
    // Handle remaining pixels
    while i + 4 <= len {
        draw_gray_pixel(&input[i..i + 4], alpha, &mut output[i..i + 4]);
        i += 4;
    }
}

// Non-WASM fallback
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_draw_grayscale_background(input: &[u8], alpha: f64, output: &mut [u8]) {
    let mut i = 0;
    while i + 4 <= input.len() {
        draw_gray_pixel(&input[i..i + 4], alpha, &mut output[i..i + 4]);
        i += 4;
    }
}

fn draw_gray_pixel(input: &[u8], alpha: f64, output: &mut [u8]) {
    let value = 255.0
        + ((input[0] as f64 * 0.29889531
            + input[1] as f64 * 0.58662247
            + input[2] as f64 * 0.11448223
            - 255.0)
            * alpha
            * input[3] as f64)
            / 255.0;
    let gray_val = value.max(0.0).min(255.0) as u8;
    output[0] = gray_val;
    output[1] = gray_val;
    output[2] = gray_val;
    output[3] = 255;
}

// Pure SIMD block compare - no writes, only comparison
#[cfg(target_arch = "wasm32")]
#[target_feature(enable = "simd128")]
unsafe fn simd_compare_block(
    image1: &[u8],
    image2: &[u8],
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    width: u32,
) -> bool {
    use std::arch::wasm32::{v128, v128_load, v128_any_true, i32x4_ne};
    
    for y in start_y..end_y {
        let row_base = (y * width) as usize * 4;
        let mut x_bytes = start_x as usize * 4;
        let end_bytes = end_x as usize * 4;

        // Process 16-byte chunks with i32x4_ne + v128_any_true
        while x_bytes + 16 <= end_bytes {
            let ptr1 = image1.as_ptr().add(row_base + x_bytes);
            let ptr2 = image2.as_ptr().add(row_base + x_bytes);
            let a = v128_load(ptr1 as *const v128);
            let b = v128_load(ptr2 as *const v128);
            
            // Use i32x4_ne for comparison, any difference means block differs
            if v128_any_true(i32x4_ne(a, b)) {
                return false;
            }
            x_bytes += 16;
        }
        
        // Handle tail with 32-bit loads (4-byte pixel granularity)
        while x_bytes + 4 <= end_bytes {
            let ptr1 = image1.as_ptr().add(row_base + x_bytes);
            let ptr2 = image2.as_ptr().add(row_base + x_bytes);
            let p1 = *(ptr1 as *const u32);
            let p2 = *(ptr2 as *const u32);
            if p1 != p2 {
                return false;
            }
            x_bytes += 4;
        }
    }
    true
}

// Fallback for non-WASM targets - pure comparison only
#[cfg(not(target_arch = "wasm32"))]
unsafe fn simd_compare_block(
    image1: &[u8],
    image2: &[u8],
    start_x: u32,
    start_y: u32,
    end_x: u32,
    end_y: u32,
    width: u32,
) -> bool {
    // Fallback using 32-bit comparison for non-WASM targets
    for y in start_y..end_y {
        let y_offset = (y * width) as usize;
        for x in start_x..end_x {
            let pixel_idx = y_offset + x as usize;
            let byte_idx = pixel_idx * 4;

            if byte_idx + 4 <= image1.len() {
                let ptr1 = image1.as_ptr().add(byte_idx);
                let ptr2 = image2.as_ptr().add(byte_idx);
                let pixel1 = *(ptr1 as *const u32);
                let pixel2 = *(ptr2 as *const u32);

                if pixel1 != pixel2 {
                    return false;
                }
            }
        }
    }
    true
}

#[inline]
fn fast_delta_pass(p1: &[u8], p2: &[u8], pre_thresh: u8) -> bool {
    // true => needs full check
    let dr = p1[0].abs_diff(p2[0]);
    let dg = p1[1].abs_diff(p2[1]);
    let db = p1[2].abs_diff(p2[2]);
    dr.max(dg).max(db) >= pre_thresh
}
