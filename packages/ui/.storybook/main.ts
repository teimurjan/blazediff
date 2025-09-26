import { join, resolve } from "node:path";
import type { StorybookConfig } from "@storybook/web-components-vite";

const storiesDir = resolve(__dirname, "../stories");

const config: StorybookConfig = {
	stories: [join(storiesDir, "**/*.stories.@(js|jsx|mjs|ts|tsx)")],
	addons: ["@storybook/addon-essentials", "@storybook/addon-links"],
	framework: {
		name: "@storybook/web-components-vite",
		options: {},
	},
};

export default config;
