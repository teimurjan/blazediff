import { loadManifest } from "../../manifest";
import { paths } from "../../paths";
import type { GraphStateType } from "../state";

export async function loadNode(
	state: GraphStateType,
): Promise<Partial<GraphStateType>> {
	if (!state.options) {
		throw new Error("loadNode: graph options missing");
	}
	const manifest = await loadManifest(state.options.cwd);
	if (!manifest) {
		throw new Error(
			`no manifest found at ${paths(state.options.cwd).manifest}. Run \`blazediff init\` then \`/blazediff\` (or capture manually) first.`,
		);
	}
	return { entries: manifest.entries };
}
