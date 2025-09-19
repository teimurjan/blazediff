@inline
export function calculateBlockSize(width: i32, height: i32): i32 {
  const area = <f32>(width * height);
  const scale = NativeMath.sqrt(area) / 100.0;
  const rawSize = 16.0 * NativeMath.sqrt(scale);

  // More efficient power-of-2 rounding using bit operations
  const log2Val = NativeMath.log(rawSize) * 1.4426950408889634; // Math.LOG2E
  return 1 << <i32>NativeMath.round(log2Val);
}
