import type { PackageInfo } from "./package";

export type Framework =
	| "next"
	| "vite-react"
	| "remix"
	| "sveltekit"
	| "astro"
	| "nuxt"
	| "gatsby"
	| "unknown";

const SIGNALS: Array<[Framework, string[]]> = [
	["next", ["next"]],
	["remix", ["@remix-run/dev", "@remix-run/serve"]],
	["sveltekit", ["@sveltejs/kit"]],
	["nuxt", ["nuxt", "nuxt3"]],
	["astro", ["astro"]],
	["gatsby", ["gatsby"]],
	["vite-react", ["vite", "react"]],
];

export function detectFramework(pkg: PackageInfo): Framework {
	const deps = pkg.allDependencies;
	for (const [framework, required] of SIGNALS) {
		if (required.every((d) => d in deps)) return framework;
	}
	return "unknown";
}
