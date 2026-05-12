import { type ChildProcess, execFile, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createConnection } from "node:net";
import path from "node:path";
import { promisify } from "node:util";
import treeKill from "tree-kill";
import { paths } from "../paths";

const execFileP = promisify(execFile);

export interface ServerHandle {
	pid: number;
	port: number;
	url: string;
	attached?: boolean;
}

export interface StartOptions {
	command: string;
	port: number;
	cwd?: string;
	logPath?: string;
	pidPath?: string;
	readyTimeoutMs?: number;
}

export interface StopResult {
	killed: boolean;
	pid: number | null;
	via: "pidfile" | "port" | "none";
}

export async function isPortOpen(
	port: number,
	host = "127.0.0.1",
): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = createConnection({ port, host });
		socket.setTimeout(500);
		socket.once("connect", () => {
			socket.destroy();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
		socket.once("timeout", () => {
			socket.destroy();
			resolve(false);
		});
	});
}

export async function waitForPort(
	port: number,
	timeoutMs = 60_000,
): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (await isPortOpen(port)) return;
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`dev server did not open port ${port} within ${timeoutMs}ms`);
}

export async function findPidByPort(port: number): Promise<number | null> {
	const platform = process.platform;
	try {
		if (platform === "darwin" || platform === "linux") {
			const { stdout } = await execFileP("lsof", [
				"-ti",
				`tcp:${port}`,
				"-sTCP:LISTEN",
			]);
			const pid = Number(stdout.trim().split("\n")[0]);
			return Number.isFinite(pid) && pid > 0 ? pid : null;
		}
		if (platform === "win32") {
			const { stdout } = await execFileP("netstat", ["-ano"]);
			const line = stdout
				.split(/\r?\n/)
				.find((l) => l.includes(`:${port} `) && l.includes("LISTENING"));
			if (!line) return null;
			const parts = line.trim().split(/\s+/);
			const pid = Number(parts[parts.length - 1]);
			return Number.isFinite(pid) && pid > 0 ? pid : null;
		}
	} catch {
		return null;
	}
	return null;
}

export async function startServer(opts: StartOptions): Promise<ServerHandle> {
	const cwd = opts.cwd ?? process.cwd();
	const logPath = opts.logPath ?? paths(cwd).serverLog;
	const pidPath = opts.pidPath ?? paths(cwd).serverPid;
	await mkdir(path.dirname(logPath), { recursive: true });

	if (await isPortOpen(opts.port)) {
		// Existing server is up - attach. Try to discover its PID so a later --kill works.
		const discoveredPid = await findPidByPort(opts.port);
		if (discoveredPid) {
			await writeFile(pidPath, String(discoveredPid), "utf8").catch(() => {});
		}
		return {
			pid: discoveredPid ?? 0,
			port: opts.port,
			url: `http://127.0.0.1:${opts.port}`,
			attached: true,
		};
	}

	const [bin, ...args] = parseCommand(opts.command);
	const child = spawn(bin, args, {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		detached: true,
		env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
	});

	const logStream = await import("node:fs").then((m) =>
		m.createWriteStream(logPath, { flags: "a" }),
	);
	child.stdout?.pipe(logStream);
	child.stderr?.pipe(logStream);

	if (!child.pid) throw new Error("failed to spawn dev server");
	await writeFile(pidPath, String(child.pid), "utf8");

	installSignalHandlers(child);

	try {
		await waitForPort(opts.port, opts.readyTimeoutMs ?? 60_000);
	} catch (err) {
		await stopProcess(child.pid);
		throw err;
	}

	return {
		pid: child.pid,
		port: opts.port,
		url: `http://127.0.0.1:${opts.port}`,
	};
}

export async function stopServer(
	cwd: string = process.cwd(),
	portFallback?: number,
): Promise<StopResult> {
	const pidPath = paths(cwd).serverPid;
	let pid: number | null = null;
	let via: StopResult["via"] = "none";

	if (existsSync(pidPath)) {
		const raw = (await readFile(pidPath, "utf8")).trim();
		const parsed = Number(raw);
		if (Number.isFinite(parsed) && parsed > 0 && processExists(parsed)) {
			pid = parsed;
			via = "pidfile";
		}
	}

	if (!pid && portFallback) {
		pid = await findPidByPort(portFallback);
		if (pid) via = "port";
	}

	if (!pid) {
		await writeFile(pidPath, "", "utf8").catch(() => {});
		return { killed: false, pid: null, via: "none" };
	}

	await stopProcess(pid);
	await writeFile(pidPath, "", "utf8").catch(() => {});
	return { killed: true, pid, via };
}

function processExists(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function stopProcess(pid: number): Promise<void> {
	if (!pid) return;
	await new Promise<void>((resolve) => {
		treeKill(pid, "SIGTERM", (err) => {
			if (err) {
				treeKill(pid, "SIGKILL", () => resolve());
				return;
			}
			resolve();
		});
	});
}

function parseCommand(command: string): string[] {
	const out: string[] = [];
	let current = "";
	let inQuote = false;
	for (const ch of command) {
		if (ch === '"') {
			inQuote = !inQuote;
			continue;
		}
		if (ch === " " && !inQuote) {
			if (current) {
				out.push(current);
				current = "";
			}
			continue;
		}
		current += ch;
	}
	if (current) out.push(current);
	return out;
}

let signalsInstalled = false;
function installSignalHandlers(child: ChildProcess): void {
	if (signalsInstalled) return;
	signalsInstalled = true;
	const cleanup = () => {
		if (child.pid) {
			try {
				process.kill(-child.pid, "SIGTERM");
			} catch {
				/* ignore */
			}
			treeKill(child.pid, "SIGKILL", () => {});
		}
	};
	process.on("SIGINT", () => {
		cleanup();
		process.exit(130);
	});
	process.on("SIGTERM", () => {
		cleanup();
		process.exit(143);
	});
	process.on("exit", cleanup);
}
