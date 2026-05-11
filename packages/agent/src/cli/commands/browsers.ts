import { Command } from "commander";
import { installBrowsers } from "../../browsers";
import type { Output } from "../output";

export function registerBrowsers(program: Command, out: Output): void {
	const cmd = program
		.command("browsers")
		.description("manage browser binaries");

	cmd.addCommand(
		new Command("install")
			.description(
				"install Playwright Chromium using the bundled playwright (no sudo, no --with-deps)",
			)
			.option("--check", "only check whether chromium is already installed")
			.action(async (opts: { check?: boolean }) => {
				const result = await installBrowsers({ check: Boolean(opts.check) });
				const human = result.installed
					? `chromium ready at ${result.executablePath}`
					: opts.check
						? "chromium not installed (run `blazediff-agent browsers install`)"
						: "chromium installed";
				out.emit({ ok: true, ...result }, human);
			}),
	);
}
