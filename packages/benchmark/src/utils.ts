import { execSync } from "node:child_process";
import { readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import transformer from "@blazediff/pngjs-transformer";
import type { AlgorithmBenchmarkResult } from "./algorithm/types";
import type { BinaryBenchmarkResult } from "./binary/types";
import type { BenchmarkArgs, ImagePair, ImagePairLoaded } from "./types";

export function safeExecSync(command: string): string {
	try {
		const stdout = execSync(command.trim()).toString();
		return stdout;
	} catch (error: any) {
		if (!error.stdout) {
			throw error;
		}
		return error.stdout.toString();
	}
}

export function getImagePairs(
	fixturesDir: string,
	fixturesSubDir: string,
): Array<ImagePair> {
	const pairs: Array<ImagePair> = [];

	// Look for pairs like 1a.png, 1b.png
	const dir = join(fixturesDir, fixturesSubDir);
	const files = readdirSync(dir);
	const pngFiles = files.filter((f: string) => f.endsWith(".png"));

	const pairMap = new Map<string, { a?: string; b?: string }>();

	for (const file of pngFiles) {
		const baseName = file.replace(/[ab]\.png$/, "");
		if (!pairMap.has(baseName)) {
			pairMap.set(baseName, {});
		}

		if (file.endsWith("a.png")) {
			pairMap.get(baseName)!.a = file;
		} else if (file.endsWith("b.png")) {
			pairMap.get(baseName)!.b = file;
		}
	}

	for (const [name, pair] of pairMap) {
		if (pair.a && pair.b) {
			pairs.push({
				a: join(fixturesDir, fixturesSubDir, pair.a),
				b: join(fixturesDir, fixturesSubDir, pair.b),
				name: `${fixturesSubDir}/${name}`,
			});
		}
	}

	return pairs;
}

export async function loadImagePairs(
	pairs: ImagePair[],
): Promise<ImagePairLoaded[]> {
	return Promise.all(
		pairs.map(async (pair) => {
			const { a, b, name } = pair;
			const [imageA, imageB] = await Promise.all([
				transformer.transform(a),
				transformer.transform(b),
			]);
			return {
				a: imageA,
				b: imageB,
				name,
			};
		}),
	);
}

export function parseBenchmarkArgs(): BenchmarkArgs {
	const args = process.argv.slice(2);
	const iterationsStr = args
		.find((arg) => arg.startsWith("--iterations="))
		?.split("=")[1];
	const iterations = iterationsStr ? parseInt(iterationsStr, 10) : 25;
	const target =
		args.find((arg) => arg.startsWith("--target="))?.split("=")[1] ??
		"blazediff";
	const variant =
		args.find((arg) => arg.startsWith("--variant="))?.split("=")[1] ??
		"algorithm";
	const format = (args
		.find((arg) => arg.startsWith("--format="))
		?.split("=")[1] ?? "markdown") as "markdown" | "json" | undefined;
	const output =
		args.find((arg) => arg.startsWith("--output="))?.split("=")[1] ?? "console";

	return { iterations, target, variant, format, output };
}

const getOutput = (
	pairs: ImagePair[],
	results: AlgorithmBenchmarkResult | BinaryBenchmarkResult,
	format: "markdown" | "json" = "markdown",
) => {
	const hasDiff = results.some((result) => "diff" in result);
	const head = hasDiff
		? ["Benchmark", "Average", "Median", "Diff"]
		: ["Benchmark", "Average", "Median"];

	const markdownRows: string[][] = [];
	const jsonRows: Array<Record<string, any>> = [];

	for (let i = 0; i < pairs.length; i++) {
		const { name } = pairs[i];
		const average = results[i].average;
		const median = results[i].median;
		const diff = hasDiff
			? (results[i] as AlgorithmBenchmarkResult[number]).diff
			: undefined;

		markdownRows.push([
			name,
			`${average.toFixed(2)}ms`,
			`${median.toFixed(2)}ms`,
			...(diff ? [diff.toString()] : []),
		]);
		jsonRows.push({
			name,
			average,
			median,
			...(hasDiff ? { diff } : {}),
		});
	}

	// Unshuffle rows
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
	pairs: ImagePair[],
	results: AlgorithmBenchmarkResult | BinaryBenchmarkResult,
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
