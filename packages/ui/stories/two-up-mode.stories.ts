import type { Meta, StoryObj } from "@storybook/html-vite";
import { mountTwoUp } from "../src";
import { FIXTURE_1_A, FIXTURE_1_B, FIXTURE_2_A } from "./fixtures";

const meta: Meta = {
	title: "Two-Up Mode",
	render: (args) => {
		const element = document.createElement("div");
		// No classes: side-by-side works out of the box (structural default).
		mountTwoUp(element, { src1: args.src1, src2: args.src2 });
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
		src2: FIXTURE_2_A,
	},
};
