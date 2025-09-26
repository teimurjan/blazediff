import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ObjectAlgorithmBenchmarkResult } from "./algorithm/types";
import type { BenchmarkArgs, ObjectPair } from "./types";

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

const getOutput = (
	pairs: ObjectPair[],
	results: ObjectAlgorithmBenchmarkResult,
	format: "markdown" | "json" = "markdown",
) => {
	const head = ["Benchmark", "Average", "Median", "Has Diff"];

	const markdownRows: string[][] = [];
	const jsonRows: Array<Record<string, any>> = [];

	for (let i = 0; i < pairs.length; i++) {
		const { name } = pairs[i];
		const average = results[i].average;
		const median = results[i].median;
		const diff = results[i].diff;

		markdownRows.push([
			name,
			`${average.toFixed(4)}ms`,
			`${median.toFixed(4)}ms`,
			diff ? "Yes" : "No",
		]);
		jsonRows.push({
			name,
			average,
			median,
			diff,
		});
	}

	// Sort rows by name for consistent output
	markdownRows.sort((a, b) => a[0].localeCompare(b[0]));
	jsonRows.sort((a, b) => a.name.localeCompare(b.name));

	if (format === "json") {
		return JSON.stringify(jsonRows, null, 2);
	}

	// Compute column widths for nice padding in Markdown/plaintext
	const columnCount = head.length;
	const columnWidths: number[] = new Array(columnCount).fill(0);
	for (let c = 0; c < columnCount; c++) {
		let maxWidth = head[c].length;
		for (let r = 0; r < markdownRows.length; r++) {
			const cell = markdownRows[r][c] ?? "";
			if (cell.length > maxWidth) maxWidth = cell.length;
		}
		columnWidths[c] = maxWidth;
	}

	const padCell = (value: string, colIdx: number) => {
		const cell = value ?? "";
		const padding = columnWidths[colIdx] - cell.length;
		return cell + (padding > 0 ? " ".repeat(padding) : "");
	};

	// Render Markdown table with padded cells
	const headerLine = `| ${head.map((h, i) => padCell(h, i)).join(" | ")} |`;
	const separatorLine = `| ${columnWidths
		.map((w) => (w < 3 ? "-".repeat(3) : "-".repeat(w)))
		.join(" | ")} |`;
	const rowLines = markdownRows.map(
		(r) => `| ${r.map((cell, i) => padCell(cell, i)).join(" | ")} |`,
	);
	const markdownTable = [headerLine, separatorLine, ...rowLines].join("\n");

	return markdownTable;
};

export const outputResults = (
	pairs: ObjectPair[],
	results: ObjectAlgorithmBenchmarkResult,
	format: "markdown" | "json" = "markdown",
	output: string = "console",
) => {
	if (output === "console") {
		console.log(getOutput(pairs, results, format));
	} else {
		writeFileSync(
			join(process.cwd(), output),
			getOutput(pairs, results, format),
		);
	}
};

export const shuffleArray = <T>(array: T[]): T[] => {
	return array.sort(() => Math.random() - 0.5);
};
