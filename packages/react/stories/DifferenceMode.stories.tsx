import type { Meta, StoryObj } from "@storybook/react";
import { DifferenceMode } from "../src/DifferenceMode";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta<typeof DifferenceMode> = {
	title: "Components/DifferenceMode",
	component: DifferenceMode,
	parameters: {
		layout: "centered",
	},
	args: {
		canvasClassName: "w-80",
	},
	argTypes: {
		threshold: {
			control: { type: "range", min: 0, max: 1, step: 0.1 },
		},
		alpha: {
			control: { type: "range", min: 0, max: 1, step: 0.1 },
		},
		includeAA: {
			control: "boolean",
		},
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		threshold: 0.1,
		includeAA: false,
		alpha: 0.1,
	},
};

export const WithEventHandlers: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		threshold: 0.1,
		includeAA: false,
		alpha: 0.1,
		onDiffComplete: (detail) => {
			console.log("Diff complete:", detail);
		},
		onDiffError: (error) => {
			console.error("Diff error:", error);
		},
	},
};
