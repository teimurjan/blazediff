import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "../paths";
import type { CheckReport } from "../types";

export async function writeJsonReport(
	report: CheckReport,
	cwd: string = process.cwd(),
): Promise<string> {
	const file = paths(cwd).report;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
	return file;
}
