export type BenchmarkUnit = "ms" | "bytes";

function formatMs(ms: number) {
	if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
	if (ms >= 100) return `${Math.round(ms)}ms`;
	return `${ms.toFixed(2)}ms`;
}

function formatBytes(bytes: number) {
	const kb = bytes / 1024;
	if (kb >= 1024 * 1024) return `${(kb / 1024 / 1024).toFixed(2)} GB`;
	if (kb >= 1024) return `${(kb / 1024).toFixed(1)} MB`;
	return `${kb.toFixed(1)} KB`;
}

export function formatValue(value: number, unit: BenchmarkUnit) {
	return unit === "bytes" ? formatBytes(value) : formatMs(value);
}

/** Axis ticks are clean round numbers, so they drop the fixed decimals. */
export function formatTick(value: number, unit: BenchmarkUnit) {
	if (value === 0) return "0";
	if (unit === "bytes") return formatBytes(value);
	return value >= 1000 ? `${value / 1000}s` : `${value}ms`;
}

/** "01", "02", ... for numbered category headings. */
export const ordinal = (i: number) => String(i + 1).padStart(2, "0");
