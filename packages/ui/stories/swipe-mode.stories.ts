import type { Meta, StoryObj } from "@storybook/html-vite";
import { mountSwipe } from "../src";
import { FIXTURE_2_A, FIXTURE_2_B } from "./fixtures";

const meta: Meta = {
	title: "Swipe Mode",
	render: (args) => {
		const element = document.createElement("div");
		mountSwipe(element, {
			src1: args.src1,
			src2: args.src2,
			containerClassName: "w-1/2 h-dvh m-auto",
		});
		return element;
	},
};

export default meta;

type Story = StoryObj;

export const Page: Story = {
	args: {
		src1: FIXTURE_2_A,
		src2: FIXTURE_2_B,
	},
};
