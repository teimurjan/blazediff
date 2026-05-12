import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths";
import type { AgentConfig } from "./types";

export async function loadConfig(
	cwd: string = process.cwd(),
): Promise<AgentConfig | null> {
	const file = paths(cwd).config;
	if (!existsSync(file)) return null;
	return JSON.parse(await readFile(file, "utf8")) as AgentConfig;
}

export async function saveConfig(
	config: AgentConfig,
	cwd: string = process.cwd(),
): Promise<void> {
	const file = paths(cwd).config;
	await mkdir(path.dirname(file), { recursive: true });
	await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function configHash(config: AgentConfig): string {
	return `sha256:${createHash("sha256").update(JSON.stringify(config)).digest("hex")}`;
}

export function resolveBaseUrl(
	config: AgentConfig | null,
	override?: string,
): string {
	if (override) return override;
	if (config?.baseUrl) return config.baseUrl;
	if (config?.devServer) return `http://127.0.0.1:${config.devServer.port}`;
	throw new Error("no baseUrl: pass --base-url or run `blazediff-agent init`");
}
