import type { Meta, StoryObj } from "@storybook/react";
import { OnionSkinMode } from "../src/OnionSkinMode";
import { FIXTURE_1_A, FIXTURE_1_B } from "./fixtures";

const meta: Meta<typeof OnionSkinMode> = {
	title: "Components/OnionSkinMode",
	component: OnionSkinMode,
	parameters: {
		layout: "centered",
	},
	args: {
		containerClassName: "flex flex-col-reverse items-center",
		sliderContainerClassName: "flex items-center gap-2 mb-2",
		imageContainerClassName: "w-80",
		sliderLabelText: "Opacity",
	},
	argTypes: {
		opacity: {
			control: { type: "range", min: 0, max: 100, step: 1 },
		},
	},
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		opacity: 50,
	},
};

export const LowOpacity: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		opacity: 20,
	},
};

export const HighOpacity: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		opacity: 80,
	},
};

export const WithEventHandlers: Story = {
	args: {
		src1: FIXTURE_1_A,
		src2: FIXTURE_1_B,
		opacity: 50,
		onOpacityChange: (opacity) => {
			console.log("Opacity changed:", opacity);
		},
		onImagesLoaded: (detail) => {
			console.log("Images loaded:", detail);
		},
		onLoadError: (error) => {
			console.error("Load error:", error);
		},
	},
};
