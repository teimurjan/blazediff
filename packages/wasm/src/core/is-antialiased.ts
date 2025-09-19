import { colorDelta } from "./color-delta";

@inline
function hasManySiblings(
    img: usize,
    x1: i32,
    y1: i32,
    width: i32,
    height: i32,
): boolean {
    const pos = y1 * width + x1;
    const baseAddr = img + (pos << 2);
    const val = load<u32>(baseAddr);
    const stride = width << 2; // Calculate once
    
    let count = (x1 === 0 || x1 === width - 1 || y1 === 0 || y1 === height - 1) ? 1 : 0;
    
    // Use pre-calculated stride
    if (y1 > 0) {
        const topAddr = baseAddr - stride;
        if (x1 > 0 && load<u32>(topAddr - 4) === val && ++count > 2) return true;
        if (load<u32>(topAddr) === val && ++count > 2) return true;
        if (x1 < width - 1 && load<u32>(topAddr + 4) === val && ++count > 2) return true;
    }
    
    if (x1 > 0 && load<u32>(baseAddr - 4) === val && ++count > 2) return true;
    if (x1 < width - 1 && load<u32>(baseAddr + 4) === val && ++count > 2) return true;
    
    if (y1 < height - 1) {
        const bottomAddr = baseAddr + stride;
        if (x1 > 0 && load<u32>(bottomAddr - 4) === val && ++count > 2) return true;
        if (load<u32>(bottomAddr) === val && ++count > 2) return true;
        if (x1 < width - 1 && load<u32>(bottomAddr + 4) === val && ++count > 2) return true;
    }
    
    return false;
}

export function isAntialiased(
  img1: usize,
  x1: i32,
  y1: i32,
  img2: usize,
  width: i32,
  height: i32,
): boolean {
  const x0 = max(0, x1 - 1);
  const y0 = max(0, y1 - 1);
  const x2 = min(width - 1, x1 + 1);
  const y2 = min(height - 1, y1 + 1);
  const centerPos = (y1 * width + x1) << 2;
  
  // Boundary check
  const onBoundary = x1 === 0 || x1 === width - 1 || y1 === 0 || y1 === height - 1;
  let zeroes: i32 = onBoundary ? 1 : 0;
  
  let minVal: f32 = 0.0;
  let maxVal: f32 = 0.0;
  let minX: i32 = 0;
  let minY: i32 = 0;
  let maxX: i32 = 0;
  let maxY: i32 = 0;
  
  // Unroll the loop for better performance
  // Process each neighbor explicitly instead of nested loops
  const neighbors: i32[] = [
      x0, y0,  x1, y0,  x2, y0,  // Top row
      x0, y1,           x2, y1,  // Middle row (skip center)
      x0, y2,  x1, y2,  x2, y2   // Bottom row
  ];
  
  for (let i = 0; i < 16; i += 2) {
      const x = neighbors[i];
      const y = neighbors[i + 1];
      
      // Skip center pixel
      if (x === x1 && y === y1) continue;
      
      const neighborPos = (y * width + x) << 2;
      const delta = colorDelta(img1, img1, centerPos, neighborPos, true);
      
      if (delta === 0.0) {
          if (++zeroes > 2) return false;
      } else if (delta < minVal) {
          minVal = delta;
          minX = x;
          minY = y;
      } else if (delta > maxVal) {
          maxVal = delta;
          maxX = x;
          maxY = y;
      }
  }
  
  if (minVal === 0.0 || maxVal === 0.0) return false;
  
  return (
      (hasManySiblings(img1, minX, minY, width, height) &&
       hasManySiblings(img2, minX, minY, width, height)) ||
      (hasManySiblings(img1, maxX, maxY, width, height) &&
       hasManySiblings(img2, maxX, maxY, width, height))
  );
}