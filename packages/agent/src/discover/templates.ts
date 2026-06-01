import type { DiscoveredRoute } from "../types";

// A list→detail template (e.g. /blog/a, /blog/b, …) produces many sibling leaves
// under one non-root parent. For visual regression a couple representatives suffice,
// so groups at/above `threshold` are sampled down to `samples` representatives.
export const DEFAULT_SAMPLE_THRESHOLD = 5;
export const DEFAULT_SAMPLES_PER_TEMPLATE = 2;

export interface TemplateSampling {
	// Group size at which sampling kicks in.
	threshold: number;
	// Representatives to keep per sampled group.
	samples: number;
}

const DEFAULT_SAMPLING: TemplateSampling = {
	threshold: DEFAULT_SAMPLE_THRESHOLD,
	samples: DEFAULT_SAMPLES_PER_TEMPLATE,
};

export interface CollapseResult {
	routes: DiscoveredRoute[];
	// Human-readable notes, one per collapsed group: "/blog/* (12 → 2)".
	collapsed: string[];
}

function parentPath(path: string): string {
	const [pathPart] = path.split("?", 2);
	const idx = pathPart.lastIndexOf("/");
	return idx <= 0 ? "/" : pathPart.slice(0, idx);
}

/**
 * Collapse large groups of sibling leaf routes that share a non-root parent —
 * the URL-only signature of a list/detail template — keeping a few representatives
 * each. Root-level pages and small groups (e.g. doc sections) pass through untouched.
 * Order is preserved.
 */
export function collapseTemplates(
	routes: DiscoveredRoute[],
	{ threshold, samples }: TemplateSampling = DEFAULT_SAMPLING,
): CollapseResult {
	const groups = new Map<string, DiscoveredRoute[]>();
	for (const route of routes) {
		const parent = parentPath(route.url);
		const group = groups.get(parent);
		if (group) group.push(route);
		else groups.set(parent, [route]);
	}

	const drop = new Set<string>();
	const collapsed: string[] = [];
	for (const [parent, group] of groups) {
		if (parent === "/" || group.length < threshold) continue;
		for (const route of group.slice(samples)) drop.add(route.url);
		collapsed.push(`${parent}/* (${group.length} → ${samples})`);
	}

	return {
		routes: drop.size ? routes.filter((r) => !drop.has(r.url)) : routes,
		collapsed,
	};
}
