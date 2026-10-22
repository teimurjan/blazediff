import fs from "node:fs";
import { fileURLToPath } from "node:url";
import nextra from "nextra";

const withNextra = nextra({});

// API reference pages live at app/apis/<pkg>/page.mdx; each subdirectory is a slug.
const apisDir = fileURLToPath(new URL("./app/apis", import.meta.url));
const apiSlugs = fs
	.readdirSync(apisDir, { withFileTypes: true })
	.filter((entry) => entry.isDirectory())
	.map((entry) => entry.name);

// The wasm demos load their modules from jsDelivr rather than from the bundle:
// wasm-bindgen's glue resolves the module with `new URL(..., import.meta.url)`,
// which Turbopack rewrites to a root-relative `/_next/static/media/...`, and
// the analysis workers run from a blob: URL where that has nothing to resolve
// against. Reading the versions from the workspace manifests keeps the CDN URLs
// pinned to whatever this checkout ships, with no second place to update.
const workspaceVersion = (pkg) =>
	JSON.parse(
		fs.readFileSync(
			fileURLToPath(
				new URL(`../../packages/${pkg}/package.json`, import.meta.url),
			),
			"utf8",
		),
	).version;

export default withNextra({
	reactStrictMode: true,
	devIndicators: false,
	env: {
		NEXT_PUBLIC_INTERPRET_WASM_VERSION: workspaceVersion("interpret-wasm"),
		NEXT_PUBLIC_CORE_WASM_VERSION: workspaceVersion("core-wasm"),
		NEXT_PUBLIC_MILO_WASM_VERSION: workspaceVersion("milo-wasm"),
	},
	async redirects() {
		// Two route renames: the friendly docs (formerly /examples) now live at
		// /docs, and the API reference (formerly /docs) moved to /apis. Keep
		// every old URL working.
		return [
			// Old example deep-links renamed during the group reshuffle.
			{
				source: "/examples/image-comparison",
				destination: "/docs/pixel-comparison/vanilla-javascript",
				permanent: true,
			},
			{
				source: "/examples/interpret",
				destination: "/docs/difference-analysis",
				permanent: true,
			},
			{
				source: "/examples/react",
				destination: "/docs/ui-components/react",
				permanent: true,
			},
			{
				source: "/examples/vanilla-components",
				destination: "/docs/ui-components/vanilla",
				permanent: true,
			},
			{
				source: "/examples/web-components",
				destination: "/docs/ui-components/vanilla",
				permanent: true,
			},
			// Everything else under the old /examples prefix now lives under /docs.
			{
				source: "/examples/:path*",
				destination: "/docs/:path*",
				permanent: true,
			},
			// The per-category benchmark pages merged into one /benchmarks page.
			{
				source: "/benchmarks/:category",
				destination: "/benchmarks#:category",
				permanent: true,
			},
			// The API reference moved from /docs/<pkg> to /apis/<pkg>.
			...apiSlugs.map((slug) => ({
				source: `/docs/${slug}`,
				destination: `/apis/${slug}`,
				permanent: true,
			})),
		];
	},
	turbopack: {
		resolveAlias: {
			"next-mdx-import-source-file": "./mdx-components.ts",
		},
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "raw.githubusercontent.com",
			},
		],
	},
});
