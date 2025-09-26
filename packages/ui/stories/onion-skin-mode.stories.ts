import type { Meta, StoryObj } from "@storybook/web-components-vite";
import "../src/onion-skin-mode";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta = {
	title: "Onion Skin Mode",
	render: (args) => {
		const element = document.createElement("blazediff-onionskin");
		element.setAttribute("src1", args.src1);
		element.setAttribute("src2", args.src2);
		if (args.opacity !== undefined)
			element.setAttribute("opacity", String(args.opacity));
		return element;
	},
};

export default meta;

type Story = StoryObj;

export const Page: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		opacity: 50,
	},
};
