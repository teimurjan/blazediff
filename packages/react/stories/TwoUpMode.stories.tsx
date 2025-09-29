import type { Meta, StoryObj } from "@storybook/react";
import { TwoUpMode } from "../src/TwoUpMode";
import { FIXTURE_1_A, FIXTURE_1_B, FIXTURE_2_A } from "./fixtures";

const meta: Meta<typeof TwoUpMode> = {
  title: "Components/TwoUpMode",
  component: TwoUpMode,
  parameters: {
    layout: "centered",
  },
  args: {
    containerClassName:
      "flex flex-col-reverse items-center gap-4 bg-gray-200 p-4",
    containerInnerClassName: "flex items-center gap-10",
    panelClassName: "w-80",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
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

export const WithEventHandlers: Story = {
  args: {
    src1: FIXTURE_1_A,
    src2: FIXTURE_1_B,
    onImagesLoaded: (detail) => {
      console.log("Images loaded:", detail);
    },
    onLoadError: (error) => {
      console.error("Load error:", error);
    },
  },
};
