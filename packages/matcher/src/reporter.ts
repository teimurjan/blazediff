import pc from "picocolors";
import type { ComparisonMethod } from "./types";

const symbols = {
	success: pc.isColorSupported ? "✔" : "√",
	error: pc.isColorSupported ? "✖" : "×",
	info: pc.isColorSupported ? "ℹ" : "i",
	arrow: pc.isColorSupported ? "└─" : "'-",
};

const SSIM_METHODS = new Set(["ssim", "msssim", "hitchhikers-ssim"]);

export interface FormatOptions {
	pass: boolean;
	method: ComparisonMethod;
	snapshotCreated: boolean;
	baselinePath: string;
	receivedPath: string;
	diffPath: string;
	diffCount?: number;
	diffPercentage?: number;
	score?: number;
	threshold: number;
	thresholdType: "pixel" | "percent";
	updateCommand?: string;
}

export function formatMessage(opts: FormatOptions): string {
	if (opts.snapshotCreated) {
		return formatNewSnapshot(opts.baselinePath);
	}
	if (opts.pass) {
		return formatSuccess();
	}
	return formatMismatch(opts);
}

function formatNewSnapshot(path: string): string {
	const lines = [
		`${pc.green(symbols.success)} ${pc.green("New snapshot created")}`,
		`  ${pc.dim(symbols.arrow)} ${pc.dim(path)}`,
	];
	return lines.join("\n");
}

function formatSuccess(): string {
	return `${pc.green(symbols.success)} ${pc.green("Image matches snapshot")}`;
}

function formatMismatch(opts: FormatOptions): string {
	const {
		method,
		baselinePath,
		receivedPath,
		diffPath,
		diffCount = 0,
		diffPercentage,
		score = 0,
		threshold,
		thresholdType,
		updateCommand,
	} = opts;

	const lines: string[] = [
		`${pc.red(symbols.error)} ${pc.red(pc.bold("Image snapshot mismatch"))}`,
		"",
	];

	const labelWidth = 12;
	lines.push(`  ${pc.dim("Method".padEnd(labelWidth))}${method}`);
	lines.push(
		`  ${pc.dim("Baseline".padEnd(labelWidth))}${pc.dim(baselinePath)}`,
	);
	lines.push(
		`  ${pc.dim("Received".padEnd(labelWidth))}${pc.dim(receivedPath)}`,
	);
	lines.push(`  ${pc.dim("Diff".padEnd(labelWidth))}${pc.dim(diffPath)}`);
	lines.push("");

	if (SSIM_METHODS.has(method)) {
		const diff = ((1 - score) * 100).toFixed(2);
		lines.push(
			`  ${pc.dim("SSIM Score".padEnd(labelWidth))}${pc.yellow(score.toFixed(4))} ${pc.dim("(1.0 = identical)")}`,
		);
		lines.push(
			`  ${pc.dim("Difference".padEnd(labelWidth))}${pc.yellow(`${diff}%`)}`,
		);
	} else if (method === "gmsd") {
		lines.push(
			`  ${pc.dim("GMSD Score".padEnd(labelWidth))}${pc.yellow(score.toFixed(4))} ${pc.dim("(0.0 = identical)")}`,
		);
	} else {
		const pct = diffPercentage?.toFixed(2) ?? "0.00";
		lines.push(
			`  ${pc.dim("Difference".padEnd(labelWidth))}${pc.yellow(diffCount.toLocaleString())} pixels ${pc.dim(`(${pct}%)`)}`,
		);
	}

	const thresholdLabel = thresholdType === "percent" ? "%" : "pixels";
	lines.push(
		`  ${pc.dim("Threshold".padEnd(labelWidth))}${threshold} ${thresholdLabel}`,
	);
	lines.push("");

	lines.push(
		`  ${pc.cyan(symbols.info)} ${pc.cyan(`Run with ${updateCommand ?? "--update"} to update the snapshot`)}`,
	);

	return lines.join("\n");
}
