import type { BenchmarkArgs } from "./types";

export const shuffleArray = <T>(array: T[]): T[] => {
	return array.sort(() => Math.random() - 0.5);
};

export function parseBenchmarkArgs(): BenchmarkArgs {
	const args = process.argv.slice(2);
	const iterationsStr = args
		.find((arg) => arg.startsWith("--iterations="))
		?.split("=")[1];
	const iterations = iterationsStr ? parseInt(iterationsStr, 10) : 10000;
	const target =
		args.find((arg) => arg.startsWith("--target="))?.split("=")[1] ??
		"blazediff";
	const variant =
		args.find((arg) => arg.startsWith("--variant="))?.split("=")[1] ?? "object";
	const format = (args
		.find((arg) => arg.startsWith("--format="))
		?.split("=")[1] ?? "markdown") as "markdown" | "json" | undefined;
	const output =
		args.find((arg) => arg.startsWith("--output="))?.split("=")[1] ?? "console";

	return { iterations, target, variant, format, output };
}
