use crate::types::Image;

pub fn make_solid_image(width: u32, height: u32, r: u8, g: u8, b: u8) -> Image {
    let mut img = Image::new(width, height);
    for i in 0..(width * height) as usize {
        let pos = i * 4;
        img.data[pos] = r;
        img.data[pos + 1] = g;
        img.data[pos + 2] = b;
        img.data[pos + 3] = 255;
    }
    img
}

pub fn set_pixel(img: &mut Image, x: u32, y: u32, r: u8, g: u8, b: u8) {
    let pos = ((y * img.width + x) * 4) as usize;
    img.data[pos] = r;
    img.data[pos + 1] = g;
    img.data[pos + 2] = b;
    img.data[pos + 3] = 255;
}

pub fn fill_block(img: &mut Image, x: u32, y: u32, w: u32, h: u32, r: u8, g: u8, b: u8) {
    for dy in 0..h {
        for dx in 0..w {
            set_pixel(img, x + dx, y + dy, r, g, b);
        }
    }
}
