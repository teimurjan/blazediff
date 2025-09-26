#!/usr/bin/env node

type BenchmarkVariant = "algorithm" | "binary" | "object";

function parseBenchmarkArgs() {
	const args = process.argv.slice(2);
	const variant = (args
		.find((arg) => arg.startsWith("--variant="))
		?.split("=")[1] ?? "algorithm") as BenchmarkVariant;

	return { variant, args };
}

async function main() {
	const { variant } = parseBenchmarkArgs();

	try {
		if (variant === "object") {
			// Run object benchmarks
			await import("./object/index");
		} else {
			// Run image benchmarks (algorithm or binary)
			await import("./image/index");
		}
	} catch (error) {
		console.error("L Benchmark failed:", error);
		process.exit(1);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(console.error);
}