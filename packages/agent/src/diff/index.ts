import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { type InterpretResult, interpret } from "@blazediff/interpret-native";
import { DEFAULT_THRESHOLD } from "../defaults";
import { paths } from "../paths";

async function fileExists(p: string): Promise<boolean> {
	try {
		await access(p);
		return true;
	} catch {
		return false;
	}
}

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
	const [hasBaseline, hasActual] = await Promise.all([
		fileExists(baselinePath),
		fileExists(actualPath),
	]);
	if (!hasBaseline || !hasActual) {
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

	// One pass now: the interpret binding writes the visual diff PNG itself.
	// Compress it — the diff is mostly background with sparse changes and the
	// report inlines it as base64, so the native default (0) bloats.
	let result: InterpretResult;
	try {
		result = await interpret(baselinePath, actualPath, diffPath, {
			threshold,
			antialiasing,
			compression: 9,
		});
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/Failed to load images/.test(message)) {
			return {
				id,
				baselinePath,
				actualPath,
				match: false,
				reason: "file-not-exists",
			};
		}
		if (/Image sizes do not match/.test(message)) {
			return {
				id,
				baselinePath,
				actualPath,
				diffPath,
				match: false,
				reason: "layout-diff",
			};
		}
		throw error;
	}

	if (result.diffCount === 0) {
		return { id, baselinePath, actualPath, match: true };
	}

	return {
		id,
		baselinePath,
		actualPath,
		diffPath,
		match: false,
		reason: "pixel-diff",
		diffCount: result.diffCount,
		diffPercentage: result.diffPercentage,
		interpretation: result,
	};
}
