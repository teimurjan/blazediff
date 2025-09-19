// Fast SIMD-based memory comparison for identical image detection
@inline
export function areIdentical(img1: usize, img2: usize, size: i32): boolean {
  const vectorSize = 16; // 128-bit vectors
  let offset: i32 = 0;

  // Process 16 bytes at a time using SIMD
  for (; offset <= size - vectorSize; offset += vectorSize) {
    const vec1 = v128.load(img1 + offset);
    const vec2 = v128.load(img2 + offset);

    const cmp = i8x16.eq(vec1, vec2);
    if (!v128.all_true<i8>(cmp)) {
      return false;
    }
  }

  // Handle remaining bytes
  for (; offset < size; offset++) {
    if (load<u8>(img1 + offset) !== load<u8>(img2 + offset)) {
      return false;
    }
  }

  return true;
}