import nextra from "nextra";

const withNextra = nextra({});

export default withNextra({
	reactStrictMode: true,
	devIndicators: false,
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
