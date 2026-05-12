import path from "node:path";

export const BLAZEDIFF_DIR = ".blazediff";

export const paths = (cwd: string = process.cwd()) => {
	const root = path.join(cwd, BLAZEDIFF_DIR);
	return {
		root,
		config: path.join(root, "config.json"),
		manifest: path.join(root, "manifest.json"),
		baselines: path.join(root, "baselines"),
		actual: path.join(root, "actual"),
		diffs: path.join(root, "diffs"),
		pendingJudgments: path.join(root, "pending-judgments"),
		judgments: path.join(root, "judgments"),
		report: path.join(root, "report.json"),
		gitignore: path.join(root, ".gitignore"),
		serverLog: path.join(root, "dev-server.log"),
		serverPid: path.join(root, "dev-server.pid"),
	};
};

export type AgentPaths = ReturnType<typeof paths>;
