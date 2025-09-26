import type { Meta, StoryObj } from "@storybook/web-components-vite";
import "../src/difference-mode";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta = {
	title: "Difference Mode",
	render: (args) => {
		const element = document.createElement("blazediff-difference");
		element.setAttribute("src1", args.src1);
		element.setAttribute("src2", args.src2);
		element.setAttribute("class-canvas", "w-80");
		if (args.threshold !== undefined) {
			element.setAttribute("threshold", String(args.threshold));
		}
		if (args.includeAA !== undefined) {
			element.setAttribute("include-aa", String(args.includeAA));
		}
		if (args.alpha !== undefined) {
			element.setAttribute("alpha", String(args.alpha));
		}
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
