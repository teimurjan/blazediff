import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import type { CheckReport } from "../types";
import { readJsonOrNull } from "../util/fs-json";

/** Persist the machine-readable check report consumed by `review`. */
export async function writeReport(
	report: CheckReport,
	cwd: string = process.cwd(),
): Promise<string> {
	const file = paths(cwd).report;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return file;
}

/** Read `.blazediff/report.json`, or null when absent/unparseable. */
export async function readReport(
	cwd: string = process.cwd(),
): Promise<CheckReport | null> {
	return readJsonOrNull<CheckReport>(paths(cwd).report);
}
