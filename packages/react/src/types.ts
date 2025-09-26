export interface BaseBlazeDiffProps {
	src1: string;
	src2: string;
	className?: string;
	containerClassName?: string;
}

export interface DifferenceModeProps extends BaseBlazeDiffProps {
	threshold?: number;
	includeAA?: boolean;
	alpha?: number;
	canvasClassName?: string;
	onDiffComplete?: (detail: {
		diffCount: number;
		totalPixels: number;
		percentage: number;
	}) => void;
	onDiffError?: (error: unknown) => void;
}

export interface SwipeModeProps extends BaseBlazeDiffProps {
	alt1?: string;
	alt2?: string;
	image1ClassName?: string;
	image2ClassName?: string;
	dividerClassName?: string;
	onPositionChange?: (position: number) => void;
}

export interface TwoUpModeProps extends BaseBlazeDiffProps {
	containerInnerClassName?: string;
	panelClassName?: string;
	imageClassName?: string;
	dimensionInfoClassName?: string;
	onImagesLoaded?: (detail: {
		image1: { width: number; height: number };
		image2: { width: number; height: number };
	}) => void;
	onLoadError?: (error: unknown) => void;
}

export interface OnionSkinModeProps extends BaseBlazeDiffProps {
	opacity?: number;
	imageContainerClassName?: string;
	imageClassName?: string;
	sliderContainerClassName?: string;
	sliderClassName?: string;
	sliderLabelClassName?: string;
	sliderLabelText?: string;
	onOpacityChange?: (opacity: number) => void;
	onImagesLoaded?: (detail: {
		image1: { width: number; height: number };
		image2: { width: number; height: number };
	}) => void;
	onLoadError?: (error: unknown) => void;
}
