import type { Meta, StoryObj } from "@storybook/html-vite";
import { mountOnionSkin } from "../src";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta = {
	title: "Onion Skin Mode",
	render: (args) => {
		const element = document.createElement("div");
		mountOnionSkin(element, {
			src1: args.src1,
			src2: args.src2,
			opacity: args.opacity,
			containerClassName: "flex flex-col-reverse items-center",
			sliderContainerClassName: "flex items-center gap-2 mb-2",
			imageContainerClassName: "w-80",
			sliderLabelText: "Opacity",
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
		opacity: 50,
	},
};
