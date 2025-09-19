@inline
export function drawPixelRGB(output: usize, pos: i32, r: u8, g: u8, b: u8): void {
  store<u8>(output + pos, r);
  store<u8>(output + pos + 1, g);
  store<u8>(output + pos + 2, b);
  store<u8>(output + pos + 3, 255);
}


@inline
export function drawPixelGray(img: usize, index: i32, alpha: f32, output: usize): void {
  const r = <f32>load<u8>(img + index);
  const g = <f32>load<u8>(img + index + 1);
  const b = <f32>load<u8>(img + index + 2);
  const a = <f32>load<u8>(img + index + 3);

  const value = 255.0 + ((r * 0.29889531 + g * 0.58662247 + b * 0.11448223 - 255.0) * alpha * a) / 255.0;
  const val = <u8>value;

  store<u8>(output + index, val);
  store<u8>(output + index + 1, val);
  store<u8>(output + index + 2, val);
  store<u8>(output + index + 3, 255);
}