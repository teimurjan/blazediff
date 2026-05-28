import { execFile, spawn } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config";
import { DEFAULT_THRESHOLD } from "../defaults";
import { paths } from "../paths";
import { readReport } from "../report/json";
import { isPortOpen } from "../server/lifecycle";
import { approveEntry, rejectEntry } from "./actions";
import { toReviewPayload } from "./map";

const execFileP = promisify(execFile);

export interface ReviewServerOptions {
	cwd: string;
	port: number;
	host: string;
	open: boolean;
}

export interface ReviewServerHandle {
	url: string;
	port: number;
	close(): Promise<void>;
}

// The built SPA lives next to the bundled CLI: dist/review/client/.
const CLIENT_DIR = path.join(__dirname, "review", "client");

const CONTENT_TYPES: Record<string, string> = {
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".css": "text/css; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
	".png": "image/png",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".map": "application/json; charset=utf-8",
};

const IMAGE_DIRS = ["baseline", "actual", "diff"] as const;
type ImageKind = (typeof IMAGE_DIRS)[number];

/** An entry id is a filename component — never a path. */
function isSafeId(id: string): boolean {
	return id.length > 0 && !/[\\/\0]/.test(id) && !id.includes("..");
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

function streamFile(res: ServerResponse, file: string): void {
	const type = CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream";
	res.writeHead(200, { "content-type": type });
	createReadStream(file)
		.on("error", () => {
			if (!res.headersSent) res.writeHead(500);
			res.end();
		})
		.pipe(res);
}

async function gitText(cwd: string, args: string[]): Promise<string> {
	try {
		const { stdout } = await execFileP("git", args, { cwd });
		return stdout.trim();
	} catch {
		return "";
	}
}

/**
 * Detect the repository's default branch from git — origin/HEAD points at it on
 * cloned repos; init.defaultBranch is the user's local preference; "main" is
 * the modern fallback. Returns empty string when none resolves.
 */
async function detectDefaultBranch(cwd: string): Promise<string> {
	const originHead = await gitText(cwd, [
		"symbolic-ref",
		"--short",
		"refs/remotes/origin/HEAD",
	]);
	if (originHead) return originHead.replace(/^origin\//, "");
	const configured = await gitText(cwd, [
		"config",
		"--get",
		"init.defaultBranch",
	]);
	if (configured) return configured;
	// Last resort: check if "main" or "master" exists as a local ref.
	for (const candidate of ["main", "master"]) {
		const sha = await gitText(cwd, [
			"rev-parse",
			"--verify",
			"--quiet",
			candidate,
		]);
		if (sha) return candidate;
	}
	return "";
}

async function buildRunMeta(cwd: string) {
	const config = await loadConfig(cwd);
	const branch = await gitText(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
	const sha = await gitText(cwd, ["rev-parse", "--short", "HEAD"]);
	const candidate = branch ? `${branch} @ ${sha}`.replace(/ @ $/, "") : "";
	const defaultBranch = await detectDefaultBranch(cwd);
	// Show a baseline only when the default branch differs from HEAD; otherwise
	// candidate and baseline are the same and the second line is noise.
	const baseRef =
		defaultBranch && branch && defaultBranch !== branch ? defaultBranch : "";
	const baseSha = baseRef
		? await gitText(cwd, ["rev-parse", "--short", baseRef])
		: "";
	const baseline = baseRef ? `${baseRef} @ ${baseSha}`.replace(/ @ $/, "") : "";
	return {
		name: path.basename(cwd),
		baseline,
		candidate,
		threshold: DEFAULT_THRESHOLD,
		_config: config,
	};
}

function imageFile(cwd: string, kind: ImageKind, id: string): string | null {
	const p = paths(cwd);
	const file =
		kind === "baseline"
			? path.join(p.baselines, `${id}.png`)
			: kind === "actual"
				? path.join(p.actual, `${id}.png`)
				: path.join(p.actual, `${id}.diff.png`);
	// Defence in depth: the resolved path must stay inside .blazediff/.
	const resolved = path.resolve(file);
	if (!resolved.startsWith(path.resolve(p.root) + path.sep)) return null;
	return resolved;
}

async function handleApi(
	req: IncomingMessage,
	res: ServerResponse,
	cwd: string,
	url: URL,
): Promise<boolean> {
	const { pathname } = url;
	const method = req.method ?? "GET";

	if (pathname === "/api/report" && method === "GET") {
		const report = await readReport(cwd);
		if (!report) {
			sendJson(res, 404, {
				error: "no report.json — run `blazediff-agent check`",
			});
			return true;
		}
		const { _config, ...meta } = await buildRunMeta(cwd);
		sendJson(res, 200, toReviewPayload(report, meta));
		return true;
	}

	const image = pathname.match(/^\/api\/image\/([^/]+)\/([^/]+)$/);
	if (image && method === "GET") {
		const kind = image[1] as ImageKind;
		const id = decodeURIComponent(image[2]);
		if (!IMAGE_DIRS.includes(kind) || !isSafeId(id)) {
			sendJson(res, 400, { error: "bad image request" });
			return true;
		}
		const file = imageFile(cwd, kind, id);
		if (!file || !existsSync(file)) {
			sendJson(res, 404, { error: "image not found" });
			return true;
		}
		streamFile(res, file);
		return true;
	}

	const action = pathname.match(/^\/api\/entries\/([^/]+)\/(approve|reject)$/);
	if (action && method === "POST") {
		const id = decodeURIComponent(action[1]);
		if (!isSafeId(id)) {
			sendJson(res, 400, { error: "bad entry id" });
			return true;
		}
		const entry =
			action[2] === "approve"
				? await approveEntry(id, cwd)
				: await rejectEntry(id, cwd);
		if (!entry) {
			sendJson(res, 409, { ok: false, error: `cannot ${action[2]} ${id}` });
			return true;
		}
		sendJson(res, 200, { ok: true, entry });
		return true;
	}

	if (pathname.startsWith("/api/")) {
		sendJson(res, 404, { error: "unknown endpoint" });
		return true;
	}
	return false;
}

async function serveStatic(
	res: ServerResponse,
	pathname: string,
): Promise<void> {
	// Map the request to a file under the client dir; fall back to index.html
	// (SPA), so deep links and unknown asset paths still boot the app.
	const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
	const candidate = path.resolve(CLIENT_DIR, rel);
	const inside = candidate.startsWith(path.resolve(CLIENT_DIR) + path.sep);
	let file = candidate;
	if (!inside || !existsSync(candidate) || !(await isFile(candidate))) {
		file = path.join(CLIENT_DIR, "index.html");
	}
	if (!existsSync(file)) {
		res.writeHead(500, { "content-type": "text/plain" });
		res.end("review client not built — run `pnpm build` in @blazediff/agent");
		return;
	}
	streamFile(res, file);
}

async function isFile(p: string): Promise<boolean> {
	try {
		return (await stat(p)).isFile();
	} catch {
		return false;
	}
}

function openBrowser(url: string): void {
	const cmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "cmd"
				: "xdg-open";
	const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
	} catch {
		// Opening is best-effort; the URL is printed regardless.
	}
}

export async function startReviewServer(
	opts: ReviewServerOptions,
): Promise<ReviewServerHandle> {
	const { cwd, host } = opts;

	let port = opts.port;
	for (let i = 0; i < 20 && (await isPortOpen(port, host)); i++) port++;

	const server: Server = createServer((req, res) => {
		const url = new URL(req.url ?? "/", `http://${host}:${port}`);
		void handleApi(req, res, cwd, url).then((handled) => {
			if (!handled) void serveStatic(res, url.pathname);
		});
	});

	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(port, host, resolve);
	});

	const url = `http://${host}:${port}`;
	if (opts.open) openBrowser(url);

	const close = () =>
		new Promise<void>((resolve) => server.close(() => resolve()));

	const onSignal = () => {
		void close().then(() => process.exit(0));
	};
	process.once("SIGINT", onSignal);
	process.once("SIGTERM", onSignal);

	return { url, port, close };
}
