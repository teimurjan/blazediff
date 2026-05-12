import type { CaptureRouteInput } from "../captures";
import type { Viewport, WaitFor } from "../types";

export function parseViewport(value: string): Viewport {
	const [w, h] = value.split("x").map((n) => Number(n));
	if (!w || !h) throw new Error(`invalid viewport: ${value} (expected WxH)`);
	return { width: w, height: h };
}

export function parsePositiveInteger(value: string, flagName: string): number {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		throw new Error(`invalid ${flagName}: ${value} (expected integer >= 1)`);
	}
	return parsed;
}

export function parsePort(value: string, flagName = "--port"): number {
	const parsed = parsePositiveInteger(value, flagName);
	if (parsed > 65_535) {
		throw new Error(
			`invalid ${flagName}: ${value} (expected integer <= 65535)`,
		);
	}
	return parsed;
}

export function parseThreshold(
	value: string,
	flagName = "--threshold",
): number {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
		throw new Error(`invalid ${flagName}: ${value} (expected number 0-1)`);
	}
	return parsed;
}

export function parseMaskList(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}

export function parseWaitFor(value: string): WaitFor[] {
	if (!value) return [];
	return value
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean)
		.map((part) =>
			part === "networkidle" || part === "fonts" ? part : { selector: part },
		);
}

export function parseRoutesPayload(raw: string): CaptureRouteInput[] {
	const trimmed = raw.trim();
	if (!trimmed) throw new Error("routes payload is empty");
	const parsed = JSON.parse(trimmed);
	if (!Array.isArray(parsed))
		throw new Error("routes payload must be a JSON array");
	return parsed as CaptureRouteInput[];
}

export function readStdin(): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		process.stdin.on("data", (c) => chunks.push(c));
		process.stdin.on("end", () =>
			resolve(Buffer.concat(chunks).toString("utf8")),
		);
		process.stdin.on("error", reject);
	});
}
