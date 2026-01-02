const LOG2_E = Math.LOG2E; // More efficient than Math.log2()

export function calculateOptimalBlockSize(
	width: number,
	height: number,
): number {
	const area = width * height;

	const scale = Math.sqrt(area) / 100;
	const rawSize = 16 * Math.sqrt(scale);

	// More efficient power-of-2 rounding using bit operations
	const log2Val = Math.log(rawSize) * LOG2_E;
	return 1 << Math.round(log2Val); // Bit shift instead of Math.pow(2, x)
}
