import { join, resolve } from "node:path";
import type { StorybookConfig } from "@storybook/html-vite";

const storiesDir = resolve(__dirname, "../stories");

const config: StorybookConfig = {
	stories: [join(storiesDir, "**/*.stories.@(js|jsx|mjs|ts|tsx)")],
	addons: ["@storybook/addon-links"],
	framework: {
		name: "@storybook/html-vite",
		options: {},
	},
	async viteFinal(config) {
		config.plugins?.push((await import("@tailwindcss/vite")).default());
		return config;
	},
};

export default config;
