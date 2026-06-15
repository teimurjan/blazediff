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

export default withNextra({
	reactStrictMode: true,
	devIndicators: false,
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
			// The PNG codec page now lives under the Rust crate API reference.
			{
				source: "/docs/png-codec",
				destination: "/apis/rust/png-codec",
				permanent: true,
			},
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
