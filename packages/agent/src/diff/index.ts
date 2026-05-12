import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
	compare,
	type InterpretResult,
	interpret,
} from "@blazediff/core-native";
import { DEFAULT_THRESHOLD } from "../defaults";
import { paths } from "../paths";

export interface DiffOptions {
	threshold?: number;
	antialiasing?: boolean;
	emitDiffPng?: boolean;
}

export interface DiffOutcome {
	id: string;
	baselinePath: string;
	actualPath: string;
	diffPath?: string;
	match: boolean;
	reason?: "pixel-diff" | "layout-diff" | "file-not-exists";
	diffCount?: number;
	diffPercentage?: number;
	interpretation?: InterpretResult;
}

export async function diffEntry(
	id: string,
	baselinePath: string,
	actualPath: string,
	opts: DiffOptions = {},
	cwd: string = process.cwd(),
): Promise<DiffOutcome> {
	if (!existsSync(baselinePath) || !existsSync(actualPath)) {
		return {
			id,
			baselinePath,
			actualPath,
			match: false,
			reason: "file-not-exists",
		};
	}

	let diffPath: string | undefined;
	if (opts.emitDiffPng) {
		const actualDir = paths(cwd).actual;
		await mkdir(actualDir, { recursive: true });
		diffPath = path.join(actualDir, `${id}.diff.png`);
	}

	const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
	const antialiasing = opts.antialiasing ?? true;

	// Two-pass: compare alone writes the diff PNG (the Rust core suppresses
	// the PNG side-effect when --interpret is on), then interpret reads regions.
	const result = await compare(baselinePath, actualPath, diffPath, {
		threshold,
		antialiasing,
	});

	if (result.match) return { id, baselinePath, actualPath, match: true };
	if (result.reason === "file-not-exists") {
		return {
			id,
			baselinePath,
			actualPath,
			match: false,
			reason: "file-not-exists",
		};
	}
	if (result.reason === "layout-diff") {
		return {
			id,
			baselinePath,
			actualPath,
			diffPath,
			match: false,
			reason: "layout-diff",
		};
	}

	const interpretation = await interpret(baselinePath, actualPath, {
		threshold,
		antialiasing,
	}).catch(() => undefined);

	return {
		id,
		baselinePath,
		actualPath,
		diffPath,
		match: false,
		reason: "pixel-diff",
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		interpretation,
	};
}
