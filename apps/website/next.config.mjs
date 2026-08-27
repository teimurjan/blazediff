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

// The interpret demo loads its wasm from jsDelivr rather than from the bundle:
// wasm-bindgen's glue resolves the module with `new URL(..., import.meta.url)`,
// which Turbopack rewrites to a root-relative `/_next/static/media/...`, and
// the analysis worker runs from a blob: URL where that has nothing to resolve
// against. Reading the version from the workspace manifest keeps the CDN URL
// pinned to whatever this checkout ships, with no second place to update.
const interpretWasmVersion = JSON.parse(
	fs.readFileSync(
		fileURLToPath(
			new URL("../../packages/interpret-wasm/package.json", import.meta.url),
		),
		"utf8",
	),
).version;

export default withNextra({
	reactStrictMode: true,
	devIndicators: false,
	env: {
		NEXT_PUBLIC_INTERPRET_WASM_VERSION: interpretWasmVersion,
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
