import type { Meta, StoryObj } from "@storybook/react";
import { SwipeMode } from "../src/SwipeMode";
import { FIXTURE_4K_1_A, FIXTURE_4K_1_B } from "./fixtures";

const meta: Meta<typeof SwipeMode> = {
	title: "Components/SwipeMode",
	component: SwipeMode,
	args: {
		className: "block",
		dividerClassName: "bg-white/50! w-1!",
	},
	parameters: {
		layout: "centered",
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		src1: FIXTURE_4K_1_A,
		src2: FIXTURE_4K_1_B,
		alt1: "Before",
		alt2: "After",
	},
};

export const WithCustomAltText: Story = {
	args: {
		src1: FIXTURE_4K_1_A,
		src2: FIXTURE_4K_1_B,
		alt1: "Original",
		alt2: "Modified",
	},
};

export const WithPositionChangeHandler: Story = {
	args: {
		src1: FIXTURE_4K_1_A,
		src2: FIXTURE_4K_1_B,
		onPositionChange: (position) => {
			console.log("Divider position:", position);
		},
	},
};
