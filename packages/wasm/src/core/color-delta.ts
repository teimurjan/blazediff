
@inline
export function colorDelta(img1: usize, img2: usize, pos1: i32, pos2: i32, yOnly: boolean): f32 {
  const pixel1 = load<u32>(img1 + pos1);
  const r1 = <f32>(pixel1 & 0xFF);
  const g1 = <f32>((pixel1 >> 8) & 0xFF);
  const b1 = <f32>((pixel1 >> 16) & 0xFF);
  const a1 = <f32>((pixel1 >> 24) & 0xFF);

  const pixel2 = load<u32>(img2 + pos2);
  const r2 = <f32>(pixel2 & 0xFF);
  const g2 = <f32>((pixel2 >> 8) & 0xFF);
  const b2 = <f32>((pixel2 >> 16) & 0xFF);
  const a2 = <f32>((pixel2 >> 24) & 0xFF);

  let dr = r1 - r2;
  let dg = g1 - g2;
  let db = b1 - b2;
  const da = a1 - a2;

  if (!dr && !dg && !db && !da) return 0.0;

  if (a1 < 255.0 || a2 < 255.0) {
    // blend pixels with background - match core implementation exactly
    const rb = 48.0 + 159.0 * <f32>((pos1 / 4) % 2);
    const gb = 48.0 + 159.0 * <f32>((<i32>((pos1 / 4) * 0.618033988749895) & 1));
    const bb = 48.0 + 159.0 * <f32>((<i32>((pos1 / 4) * 0.381966011250105) & 1));
    dr = <f32>((r1 * a1 - r2 * a2 - rb * da) / 255.0);
    dg = <f32>((g1 * a1 - g2 * a2 - gb * da) / 255.0);
    db = <f32>((b1 * a1 - b2 * a2 - bb * da) / 255.0);
  }

  const y = dr * 0.29889531 + dg * 0.58662247 + db * 0.11448223;

  if (yOnly) return y; // brightness difference only

  const i = dr * 0.59597799 - dg * 0.2741761 - db * 0.32180189;
  const q = dr * 0.21147017 - dg * 0.52261711 + db * 0.31114694;

  const delta = <f32>(0.5053 * y * y + 0.299 * i * i + 0.1957 * q * q);

  // encode whether the pixel lightens or darkens in the sign
  return y > 0.0 ? -delta : delta;
}
