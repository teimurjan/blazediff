import type { Meta, StoryObj } from "@storybook/web-components-vite";
import "../src/swipe-mode";
import { FIXTURE_2_A, FIXTURE_2_B } from "./fixtures";

const meta: Meta = {
	title: "Swipe Mode",
	render: (args) => {
		const element = document.createElement("blazediff-swipe");
		element.setAttribute("src1", args.src1);
		element.setAttribute("src2", args.src2);
		element.setAttribute("class-container", "w-1/2 h-dvh m-auto");
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
		src1: FIXTURE_2_A,
		src2: FIXTURE_2_B,
	},
};
