import type { Meta, StoryObj } from "@storybook/web-components-vite";
import "../src/two-up-mode";
import { FIXTURE_1_A, FIXTURE_1_B, FIXTURE_4K_1_A } from "./fixtures";

const meta: Meta = {
	title: "Two-Up Mode",
	render: (args) => {
		const element = document.createElement("blazediff-twoup");
		element.setAttribute("src1", args.src1);
		element.setAttribute("src2", args.src2);
		return element;
	},
};

export default meta;

type Story = StoryObj;

export const Page: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
	},
};

export const DifferentSizes: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_4K_1_A,
	},
};
