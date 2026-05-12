import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CheckReport } from "../types";

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

export async function writeJunit(
	report: CheckReport,
	destPath: string,
): Promise<string> {
	await mkdir(path.dirname(destPath), { recursive: true });
	const cases = report.results.map((r) => {
		if (r.status === "pass") {
			return `    <testcase classname="blazediff" name="${escapeXml(r.id)}"/>`;
		}
		const message = r.message ?? r.status;
		return `    <testcase classname="blazediff" name="${escapeXml(r.id)}">
      <failure message="${escapeXml(message)}" type="${escapeXml(r.status)}">${escapeXml(message)}</failure>
    </testcase>`;
	});
	const failures = report.totalEntries - report.passed;
	const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="blazediff" tests="${report.totalEntries}" failures="${failures}">
${cases.join("\n")}
  </testsuite>
</testsuites>
`;
	await writeFile(destPath, xml, "utf8");
	return destPath;
}
