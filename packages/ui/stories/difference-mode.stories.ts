import type { Meta, StoryObj } from "@storybook/html-vite";
import { mountDifference } from "../src";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta = {
	title: "Difference Mode",
	render: (args) => {
		const element = document.createElement("div");
		mountDifference(element, {
			src1: args.src1,
			src2: args.src2,
			canvasClassName: "w-80",
			threshold: args.threshold,
			includeAA: args.includeAA,
			alpha: args.alpha,
		});
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
